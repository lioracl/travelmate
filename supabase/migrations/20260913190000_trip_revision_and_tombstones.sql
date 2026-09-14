-- Atomic optimistic concurrency and persistent deletion for TravelMate trips.
-- This migration is additive for stored rows. Client writes move to the RPCs below;
-- direct authenticated mutations are revoked so legacy writers fail without data loss.

alter table public.travel_trips
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists deleted_at timestamptz,
  add column if not exists last_mutation_id uuid,
  add column if not exists last_mutation_by uuid references auth.users(id) on delete set null;

create index if not exists travel_trips_visible_updated_idx
  on public.travel_trips (user_id, updated_at desc)
  where deleted_at is null;

drop policy if exists "Users read their own trips" on public.travel_trips;
drop policy if exists "Members read shared trips" on public.travel_trips;
create policy "Members read shared trips"
  on public.travel_trips for select to authenticated
  using (deleted_at is null and public.is_trip_member(user_id, id));

create or replace function public.save_travel_trip(
  p_owner_id uuid,
  p_trip_id text,
  p_expected_revision bigint,
  p_expected_updated_at timestamptz,
  p_mutation_id uuid,
  p_trip jsonb
)
returns table(result_status text, result_revision bigint, result_updated_at timestamptz, result_deleted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_trip public.travel_trips%rowtype;
  next_revision bigint;
  server_time timestamptz := clock_timestamp();
  clean_payload jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.mfa_satisfied_if_enrolled() then
    raise exception 'MFA required' using errcode = '42501';
  end if;
  if p_mutation_id is null or nullif(p_trip_id, '') is null or p_trip is null then
    raise exception 'Invalid trip mutation' using errcode = '22023';
  end if;

  select * into current_trip
  from public.travel_trips
  where user_id = p_owner_id and id = p_trip_id
  for update;

  if not found then
    if actor_id <> p_owner_id then
      raise exception 'Only the owner can create a trip' using errcode = '42501';
    end if;
    if coalesce(p_expected_revision, 0) <> 0 or p_expected_updated_at is not null then
      return query select 'conflict'::text, null::bigint, null::timestamptz, null::timestamptz;
      return;
    end if;
    next_revision := 1;
    clean_payload := jsonb_set(p_trip - 'syncStatus' - 'syncMutationId', '{cloudRevision}', to_jsonb(next_revision), true);
    insert into public.travel_trips (
      user_id, id, country, city, start_date, end_date, budget, trip_type, days,
      payload, updated_at, updated_by, revision, deleted_at, last_mutation_id, last_mutation_by
    ) values (
      p_owner_id,
      p_trip_id,
      coalesce(p_trip ->> 'country', ''),
      coalesce(p_trip ->> 'city', ''),
      (p_trip ->> 'start')::date,
      (p_trip ->> 'end')::date,
      coalesce((p_trip ->> 'budget')::numeric, 0),
      coalesce(nullif(p_trip ->> 'type', ''), 'סולו'),
      coalesce((p_trip ->> 'days')::integer, 1),
      clean_payload,
      server_time,
      actor_id,
      next_revision,
      null,
      p_mutation_id,
      actor_id
    );
    return query select 'saved'::text, next_revision, server_time, null::timestamptz;
    return;
  end if;

  if current_trip.last_mutation_id = p_mutation_id and current_trip.last_mutation_by = actor_id then
    return query select
      case when current_trip.deleted_at is null then 'saved' else 'deleted' end,
      current_trip.revision, current_trip.updated_at, current_trip.deleted_at;
    return;
  end if;
  if current_trip.deleted_at is not null then
    return query select 'deleted'::text, current_trip.revision, current_trip.updated_at, current_trip.deleted_at;
    return;
  end if;
  if not public.can_edit_trip(p_owner_id, p_trip_id) then
    raise exception 'Trip edit forbidden' using errcode = '42501';
  end if;
  if p_expected_revision is not null then
    if p_expected_revision <> current_trip.revision then
      return query select 'conflict'::text, current_trip.revision, current_trip.updated_at, current_trip.deleted_at;
      return;
    end if;
  elsif p_expected_updated_at is null or p_expected_updated_at <> current_trip.updated_at then
    return query select 'conflict'::text, current_trip.revision, current_trip.updated_at, current_trip.deleted_at;
    return;
  end if;

  next_revision := current_trip.revision + 1;
  clean_payload := jsonb_set(p_trip - 'syncStatus' - 'syncMutationId', '{cloudRevision}', to_jsonb(next_revision), true);
  update public.travel_trips set
    country = coalesce(p_trip ->> 'country', country),
    city = coalesce(p_trip ->> 'city', city),
    start_date = coalesce((p_trip ->> 'start')::date, start_date),
    end_date = coalesce((p_trip ->> 'end')::date, end_date),
    budget = coalesce((p_trip ->> 'budget')::numeric, budget),
    trip_type = coalesce(nullif(p_trip ->> 'type', ''), trip_type),
    days = coalesce((p_trip ->> 'days')::integer, days),
    payload = clean_payload,
    updated_at = server_time,
    updated_by = actor_id,
    revision = next_revision,
    last_mutation_id = p_mutation_id,
    last_mutation_by = actor_id
  where user_id = p_owner_id and id = p_trip_id;

  return query select 'saved'::text, next_revision, server_time, null::timestamptz;
end;
$$;

create or replace function public.delete_travel_trip(
  p_owner_id uuid,
  p_trip_id text,
  p_expected_revision bigint,
  p_expected_updated_at timestamptz,
  p_mutation_id uuid
)
returns table(result_status text, result_revision bigint, result_updated_at timestamptz, result_deleted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_trip public.travel_trips%rowtype;
  next_revision bigint;
  server_time timestamptz := clock_timestamp();
begin
  if actor_id is null or actor_id <> p_owner_id then
    raise exception 'Only the owner can delete a trip' using errcode = '42501';
  end if;
  if not public.mfa_satisfied_if_enrolled() then
    raise exception 'MFA required' using errcode = '42501';
  end if;
  if p_mutation_id is null or nullif(p_trip_id, '') is null then
    raise exception 'Invalid trip deletion' using errcode = '22023';
  end if;

  select * into current_trip
  from public.travel_trips
  where user_id = p_owner_id and id = p_trip_id
  for update;

  if not found then
    return query select 'not_found'::text, null::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;
  if current_trip.last_mutation_id = p_mutation_id and current_trip.last_mutation_by = actor_id then
    return query select 'deleted'::text, current_trip.revision, current_trip.updated_at, current_trip.deleted_at;
    return;
  end if;
  if current_trip.deleted_at is not null then
    return query select 'deleted'::text, current_trip.revision, current_trip.updated_at, current_trip.deleted_at;
    return;
  end if;
  if p_expected_revision is not null then
    if p_expected_revision <> current_trip.revision then
      return query select 'conflict'::text, current_trip.revision, current_trip.updated_at, current_trip.deleted_at;
      return;
    end if;
  elsif p_expected_updated_at is null or p_expected_updated_at <> current_trip.updated_at then
    return query select 'conflict'::text, current_trip.revision, current_trip.updated_at, current_trip.deleted_at;
    return;
  end if;

  next_revision := current_trip.revision + 1;
  update public.travel_trips set
    deleted_at = server_time,
    updated_at = server_time,
    updated_by = actor_id,
    revision = next_revision,
    last_mutation_id = p_mutation_id,
    last_mutation_by = actor_id
  where user_id = p_owner_id and id = p_trip_id;

  return query select 'deleted'::text, next_revision, server_time, server_time;
end;
$$;

create or replace function public.list_travel_trip_tombstones()
returns table(owner_id uuid, trip_id text, revision bigint, deleted_at timestamptz)
language sql
security definer
stable
set search_path = ''
as $$
  select trips.user_id, trips.id, trips.revision, trips.deleted_at
  from public.travel_trips as trips
  where auth.uid() is not null
    and public.mfa_satisfied_if_enrolled()
    and trips.deleted_at is not null
    and public.is_trip_member(trips.user_id, trips.id);
$$;

revoke all on function public.save_travel_trip(uuid, text, bigint, timestamptz, uuid, jsonb) from public, anon;
revoke all on function public.delete_travel_trip(uuid, text, bigint, timestamptz, uuid) from public, anon;
revoke all on function public.list_travel_trip_tombstones() from public, anon;
grant execute on function public.save_travel_trip(uuid, text, bigint, timestamptz, uuid, jsonb) to authenticated;
grant execute on function public.delete_travel_trip(uuid, text, bigint, timestamptz, uuid) to authenticated;
grant execute on function public.list_travel_trip_tombstones() to authenticated;

-- Trigger-only helper: never expose it as a PostgREST RPC.
revoke all on function public.add_trip_owner_member() from public, anon, authenticated;

-- All mutations must pass through the revision-aware RPC contract. REVOKE ALL
-- also removes legacy TRUNCATE/TRIGGER privileges, which bypass row-level DML rules.
revoke all on table public.travel_trips from authenticated;
grant select on table public.travel_trips to authenticated;

comment on column public.travel_trips.revision is 'Server-authoritative optimistic concurrency revision.';
comment on column public.travel_trips.deleted_at is 'Persistent deletion tombstone; hidden from normal trip reads.';
comment on function public.save_travel_trip(uuid, text, bigint, timestamptz, uuid, jsonb) is 'Atomically create/update a trip when the expected server version matches; mutation IDs make ambiguous retries idempotent.';
comment on function public.delete_travel_trip(uuid, text, bigint, timestamptz, uuid) is 'Atomically soft-delete an owner trip while retaining a persistent revision tombstone.';
comment on function public.list_travel_trip_tombstones() is 'Returns only tombstone metadata for trips visible to the authenticated member, allowing full sync to remove stale local copies.';
