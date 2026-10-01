-- Source-only migration. No backfill, object deletion, scheduling or bucket changes.
create schema if not exists document_recovery;
revoke all on schema document_recovery from public, anon, authenticated, service_role;

create table document_recovery.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  trip_id text not null,
  storage_path text not null unique,
  state text not null default 'pending' check (state in
    ('pending','committed','recovery_hold','cleanup_requested','deleting','deleted','ambiguous')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  cleanup_after timestamptz,
  object_id uuid,
  object_updated_at timestamptz,
  claim_token uuid,
  next_attempt_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  check (split_part(storage_path, '/', 1) = user_id::text),
  check (storage_path !~ '(^|/)\.\.?(/|$)' and position(chr(92) in storage_path) = 0)
);
alter table document_recovery.uploads enable row level security;
revoke all on document_recovery.uploads from public, anon, authenticated, service_role;
create index document_upload_recovery_due_idx on document_recovery.uploads (state, next_attempt_at, cleanup_after);

create function document_recovery.require_owner() returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null or not exists (select 1 from auth.users where id = owner_id)
     or not public.mfa_satisfied_if_enrolled() then
    raise exception 'DOCUMENT_AUTH_OR_MFA_REQUIRED' using errcode = '42501';
  end if;
  return owner_id;
end $$;
revoke all on function document_recovery.require_owner() from public, anon, authenticated, service_role;

create function public.begin_document_upload(p_trip_id text,p_expected_owner uuid)
returns table(upload_id uuid, storage_path text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := document_recovery.require_owner(); new_id uuid := gen_random_uuid();
begin
  if p_expected_owner is distinct from owner_id then raise exception 'DOCUMENT_SESSION_CHANGED' using errcode='42501'; end if;
  if p_trip_id is null or length(p_trip_id) not between 1 and 200 then raise exception 'INVALID_TRIP_ID'; end if;
  -- A journal is committed before any upload; no client-provided owner or path.
  return query insert into document_recovery.uploads as u (id,user_id,trip_id,storage_path)
    values (new_id,owner_id,p_trip_id,owner_id::text || '/__lifecycle_v1/' || new_id::text || '.vault')
    returning u.id,u.storage_path,u.expires_at;
end $$;
revoke all on function public.begin_document_upload(text,uuid) from public, anon, service_role;
grant execute on function public.begin_document_upload(text,uuid) to authenticated;

create function public.abandon_document_upload(p_upload_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := document_recovery.require_owner(); u document_recovery.uploads;
begin
  select * into u from document_recovery.uploads where id=p_upload_id and user_id=owner_id for update;
  if not found then raise exception 'DOCUMENT_OPERATION_NOT_OWNED' using errcode='42501'; end if;
  if u.state <> 'pending' or exists (select 1 from public.travel_documents where storage_path=u.storage_path) then return; end if;
  update document_recovery.uploads set state='cleanup_requested', expires_at=now(),
    cleanup_after=now()+interval '24 hours' where id=u.id;
end $$;
revoke all on function public.abandon_document_upload(uuid) from public, anon, service_role;
grant execute on function public.abandon_document_upload(uuid) to authenticated;

-- Additional restrictive write fence. Existing ownership and MFA policies remain.
-- Locking serializes in-flight Storage writes with metadata commit and recovery.
create function document_recovery.write_allowed(p_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare u document_recovery.uploads;
begin
  select * into u from document_recovery.uploads where storage_path=p_path for share;
  if not found then return false; end if;
  return u.user_id=auth.uid() and u.state='pending' and u.expires_at>clock_timestamp();
end $$;
revoke all on function document_recovery.write_allowed(text) from public, anon, service_role;
grant usage on schema document_recovery to authenticated;
grant execute on function document_recovery.write_allowed(text) to authenticated;
create policy "Document journal fences inserts" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'travel-documents' or document_recovery.write_allowed(name));
create policy "Document journal fences updates" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'travel-documents' or document_recovery.write_allowed(name))
  with check (bucket_id <> 'travel-documents' or document_recovery.write_allowed(name));

create function document_recovery.commit_metadata() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u document_recovery.uploads; o storage.objects;
begin
  if tg_op='UPDATE' and (new.storage_path<>old.storage_path or new.user_id<>old.user_id) then
    raise exception 'DOCUMENT_OWNER_AND_PATH_IMMUTABLE' using errcode='42501';
  end if;
  select * into u from document_recovery.uploads where storage_path=new.storage_path for update;
  if not found then
    if tg_op='INSERT' then raise exception 'DOCUMENT_JOURNAL_REQUIRED'; end if;
    return new;
  end if;
  if new.user_id<>u.user_id or new.trip_id<>u.trip_id then raise exception 'DOCUMENT_OPERATION_NOT_OWNED' using errcode='42501'; end if;
  if tg_op='UPDATE' and u.state='committed' then return new; end if;
  if u.state <> 'pending' or u.expires_at <= clock_timestamp() then raise exception 'DOCUMENT_COMMIT_WINDOW_CLOSED'; end if;
  select * into o from storage.objects where bucket_id='travel-documents' and name=u.storage_path;
  if not found or o.owner_id is distinct from u.user_id::text then raise exception 'DOCUMENT_OBJECT_NOT_OWNED'; end if;
  update document_recovery.uploads set state='committed',object_id=o.id,object_updated_at=o.updated_at where id=u.id;
  return new;
end $$;
revoke all on function document_recovery.commit_metadata() from public, anon, authenticated, service_role;
create trigger document_metadata_commit before insert or update on public.travel_documents
  for each row execute function document_recovery.commit_metadata();

create function document_recovery.record_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u document_recovery.uploads; o storage.objects;
begin
  -- Only an actual metadata DELETE provides legacy cleanup provenance; no scan/backfill.
  if split_part(old.storage_path,'/',1) <> old.user_id::text then return old; end if;
  select * into u from document_recovery.uploads where storage_path=old.storage_path for update;
  select * into o from storage.objects where bucket_id='travel-documents' and name=old.storage_path;
  if u.id is null then
    insert into document_recovery.uploads(user_id,trip_id,storage_path,state,object_id,object_updated_at,cleanup_after)
    values(old.user_id,old.trip_id,old.storage_path,
      case when o.id is not null and o.owner_id=old.user_id::text then 'cleanup_requested' else 'ambiguous' end,
      o.id,o.updated_at,now()+interval '24 hours');
  elsif u.user_id=old.user_id then
    if o.id is null or o.owner_id is distinct from old.user_id::text or
      (u.object_id is not null and u.object_id<>o.id) then
      update document_recovery.uploads set state='ambiguous',claim_token=null,last_error='DELETE_IDENTITY_UNCONFIRMED' where id=u.id;
    else
      -- Explicit deletion binds the same object as observed at deletion time;
      -- harmless metadata timestamps may have changed since the upload commit.
      update document_recovery.uploads set state='cleanup_requested',cleanup_after=now()+interval '24 hours',
        object_id=o.id,object_updated_at=o.updated_at,expires_at=now(),claim_token=null,next_attempt_at=null where id=u.id;
    end if;
  end if;
  return old;
end $$;
revoke all on function document_recovery.record_delete() from public, anon, authenticated, service_role;
create trigger document_metadata_delete after delete on public.travel_documents
  for each row execute function document_recovery.record_delete();

create function document_recovery.require_worker() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception 'DOCUMENT_WORKER_REQUIRED' using errcode='42501';
  end if;
end $$;
revoke all on function document_recovery.require_worker() from public, anon, authenticated, service_role;

create function public.claim_document_cleanup(p_limit integer default 50)
returns table(upload_id uuid,user_id uuid,storage_path text,object_id uuid,claim_token uuid)
language plpgsql security definer set search_path = '' as $$
declare u document_recovery.uploads; o storage.objects; token uuid;
begin
  perform document_recovery.require_worker();
  for u in select * from document_recovery.uploads j
    where j.state in ('pending','recovery_hold','cleanup_requested','deleting')
      and (j.state<>'pending' or j.expires_at<=now())
      and coalesce(j.next_attempt_at,j.cleanup_after,j.expires_at)<=now()
    order by coalesce(j.next_attempt_at,j.cleanup_after,j.expires_at),j.id
    limit greatest(1,least(coalesce(p_limit,50),100)) for update skip locked
  loop
    -- Any surviving reference, including unexpected ownership, protects the file.
    if exists(select 1 from public.travel_documents d where d.storage_path=u.storage_path) then
      update document_recovery.uploads set state='committed',claim_token=null where id=u.id;
      continue;
    end if;
    select * into o from storage.objects where bucket_id='travel-documents' and name=u.storage_path;
    if o.id is null then
      update document_recovery.uploads set state='ambiguous',
        claim_token=null,last_error='OBJECT_ABSENT' where id=u.id;
      continue;
    end if;
    if o.owner_id is distinct from u.user_id::text or split_part(o.name,'/',1)<>u.user_id::text
       or (u.object_id is not null and (u.object_id<>o.id or u.object_updated_at is distinct from o.updated_at)) then
      update document_recovery.uploads set state='ambiguous',claim_token=null,last_error='OBJECT_IDENTITY_CHANGED' where id=u.id;
      continue;
    end if;
    -- First observation is never a deletion candidate. Freeze commit/writes and
    -- wait another full day with stable identity, even after a lost acknowledgement.
    if u.state='pending' or u.object_id is null then
      update document_recovery.uploads set state='recovery_hold',object_id=o.id,object_updated_at=o.updated_at,
        cleanup_after=now()+interval '24 hours',next_attempt_at=null where id=u.id;
      continue;
    end if;
    token := gen_random_uuid();
    update document_recovery.uploads set state='deleting',claim_token=token,attempts=attempts+1,
      next_attempt_at=now()+interval '10 minutes' where id=u.id;
    upload_id:=u.id; user_id:=u.user_id; storage_path:=u.storage_path; object_id:=o.id; claim_token:=token;
    return next;
  end loop;
end $$;
revoke all on function public.claim_document_cleanup(integer) from public, anon, authenticated;
grant execute on function public.claim_document_cleanup(integer) to service_role;

create function public.authorize_document_cleanup(p_upload_id uuid,p_claim_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare u document_recovery.uploads;
begin
  perform document_recovery.require_worker();
  select * into u from document_recovery.uploads where id=p_upload_id for update;
  return found and u.state='deleting' and u.claim_token=p_claim_token and u.next_attempt_at>now()
    and not exists(select 1 from public.travel_documents where storage_path=u.storage_path)
    and exists(select 1 from storage.objects o where o.bucket_id='travel-documents' and o.name=u.storage_path
      and o.id=u.object_id and o.owner_id=u.user_id::text and o.updated_at is not distinct from u.object_updated_at);
end $$;
revoke all on function public.authorize_document_cleanup(uuid,uuid) from public, anon, authenticated;
grant execute on function public.authorize_document_cleanup(uuid,uuid) to service_role;

create function public.finish_document_cleanup(p_upload_id uuid,p_claim_token uuid,p_failed boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare u document_recovery.uploads;
begin
  perform document_recovery.require_worker();
  select * into u from document_recovery.uploads where id=p_upload_id for update;
  if not found or u.state<>'deleting' or u.claim_token is distinct from p_claim_token then return; end if;
  if exists(select 1 from public.travel_documents where storage_path=u.storage_path) then
    update document_recovery.uploads set state='ambiguous',claim_token=null,last_error='REFERENCE_PRESENT' where id=u.id;
  elsif not exists(select 1 from storage.objects where bucket_id='travel-documents' and name=u.storage_path) then
    update document_recovery.uploads set state=case when p_failed then 'ambiguous' else 'deleted' end,
      claim_token=null,last_error=case when p_failed then 'STORAGE_REMOVE_AMBIGUOUS' else null end where id=u.id;
  else
    update document_recovery.uploads set state='cleanup_requested',claim_token=null,
      next_attempt_at=now()+least(interval '24 hours',interval '10 minutes' * power(2,least(u.attempts,7))),
      last_error=case when p_failed then 'STORAGE_REMOVE_FAILED' else 'STORAGE_REMOVE_UNCONFIRMED' end where id=u.id;
  end if;
end $$;
revoke all on function public.finish_document_cleanup(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.finish_document_cleanup(uuid,uuid,boolean) to service_role;
