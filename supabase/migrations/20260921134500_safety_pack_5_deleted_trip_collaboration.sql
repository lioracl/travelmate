-- Safety Pack 5: close collaboration access when a trip becomes a tombstone.
-- Keep trip_members rows so former collaborators can still discover the tombstone
-- through list_travel_trip_tombstones(), but hide collaboration data from direct access.

create or replace function public.create_trip_invite(
  p_trip_owner_id uuid,
  p_trip_id text,
  p_role text default 'editor'::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_token uuid;
begin
  if auth.uid() is null or auth.uid() <> p_trip_owner_id then
    raise exception 'Only the trip owner can create invitations' using errcode = '42501';
  end if;

  if not public.mfa_satisfied_if_enrolled() then
    raise exception 'MFA required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.travel_trips
    where user_id = p_trip_owner_id
      and id = p_trip_id
      and deleted_at is null
  ) or not public.is_trip_member(p_trip_owner_id, p_trip_id) then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;

  insert into public.trip_invites (trip_owner_id, trip_id, role, created_by)
  values (
    p_trip_owner_id,
    p_trip_id,
    case when p_role = 'viewer' then 'viewer' else 'editor' end,
    auth.uid()
  )
  returning token into new_token;

  return new_token;
end;
$function$;

create or replace function public.accept_trip_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  invitation public.trip_invites%rowtype;
  member_name text;
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.mfa_satisfied_if_enrolled() then
    raise exception 'MFA required' using errcode = '42501';
  end if;

  select * into invitation
  from public.trip_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Invitation is invalid or expired' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.travel_trips
    where user_id = invitation.trip_owner_id
      and id = invitation.trip_id
      and deleted_at is null
  ) then
    raise exception 'Invitation is invalid or expired' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.trip_members
    where trip_owner_id = invitation.trip_owner_id
      and trip_id = invitation.trip_id
      and user_id = actor_id
  ) then
    return jsonb_build_object(
      'owner_id', invitation.trip_owner_id,
      'trip_id', invitation.trip_id,
      'already_member', true
    );
  end if;

  if invitation.expires_at <= now() or invitation.use_count >= invitation.max_uses then
    raise exception 'Invitation is invalid or expired' using errcode = 'P0002';
  end if;

  member_name := coalesce(
    nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''),
    'מטייל'
  );

  insert into public.trip_members (trip_owner_id, trip_id, user_id, display_name, role)
  values (invitation.trip_owner_id, invitation.trip_id, actor_id, member_name, invitation.role)
  on conflict (trip_owner_id, trip_id, user_id) do update
    set display_name = excluded.display_name;

  update public.trip_invites
  set use_count = use_count + 1
  where token = p_token;

  return jsonb_build_object(
    'owner_id', invitation.trip_owner_id,
    'trip_id', invitation.trip_id,
    'already_member', false
  );
end;
$function$;

create or replace function public.delete_travel_trip(
  p_owner_id uuid,
  p_trip_id text,
  p_expected_revision bigint,
  p_expected_updated_at timestamptz,
  p_mutation_id uuid
)
returns table(
  result_status text,
  result_revision bigint,
  result_updated_at timestamptz,
  result_deleted_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
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
    if current_trip.deleted_at is not null then
      delete from public.trip_invites
      where trip_owner_id = p_owner_id and trip_id = p_trip_id;
      delete from public.trip_messages
      where trip_owner_id = p_owner_id and trip_id = p_trip_id;
    end if;
    return query select 'deleted'::text, current_trip.revision, current_trip.updated_at, current_trip.deleted_at;
    return;
  end if;
  if current_trip.deleted_at is not null then
    delete from public.trip_invites
    where trip_owner_id = p_owner_id and trip_id = p_trip_id;
    delete from public.trip_messages
    where trip_owner_id = p_owner_id and trip_id = p_trip_id;
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

  delete from public.trip_invites
  where trip_owner_id = p_owner_id and trip_id = p_trip_id;

  delete from public.trip_messages
  where trip_owner_id = p_owner_id and trip_id = p_trip_id;

  return query select 'deleted'::text, next_revision, server_time, server_time;
end;
$function$;

drop policy if exists "Members leave trips" on public.trip_members;
create policy "Members leave trips"
on public.trip_members
for delete
to authenticated
using (
  user_id <> trip_owner_id
  and (auth.uid() = user_id or auth.uid() = trip_owner_id)
  and exists (
    select 1 from public.travel_trips as trips
    where trips.user_id = trip_owner_id
      and trips.id = trip_id
      and trips.deleted_at is null
  )
);

drop policy if exists "Members see trip members" on public.trip_members;
create policy "Members see trip members"
on public.trip_members
for select
to authenticated
using (
  public.is_trip_member(trip_owner_id, trip_id)
  and exists (
    select 1 from public.travel_trips as trips
    where trips.user_id = trip_owner_id
      and trips.id = trip_id
      and trips.deleted_at is null
  )
);

drop policy if exists "Owners manage trip members" on public.trip_members;
create policy "Owners manage trip members"
on public.trip_members
for update
to authenticated
using (
  auth.uid() = trip_owner_id
  and exists (
    select 1 from public.travel_trips as trips
    where trips.user_id = trip_owner_id
      and trips.id = trip_id
      and trips.deleted_at is null
  )
)
with check (
  auth.uid() = trip_owner_id
  and (user_id <> trip_owner_id or role = 'owner')
  and exists (
    select 1 from public.travel_trips as trips
    where trips.user_id = trip_owner_id
      and trips.id = trip_id
      and trips.deleted_at is null
  )
);

drop policy if exists "Senders delete trip messages" on public.trip_messages;
create policy "Senders delete trip messages"
on public.trip_messages
for delete
to authenticated
using (
  (auth.uid() = sender_user_id or auth.uid() = trip_owner_id)
  and exists (
    select 1 from public.travel_trips as trips
    where trips.user_id = trip_owner_id
      and trips.id = trip_id
      and trips.deleted_at is null
  )
);

drop policy if exists "Members send trip messages" on public.trip_messages;
create policy "Members send trip messages"
on public.trip_messages
for insert
to authenticated
with check (
  auth.uid() = sender_user_id
  and public.is_trip_member(trip_owner_id, trip_id)
  and exists (
    select 1 from public.travel_trips as trips
    where trips.user_id = trip_owner_id
      and trips.id = trip_id
      and trips.deleted_at is null
  )
);

drop policy if exists "Members read trip messages" on public.trip_messages;
create policy "Members read trip messages"
on public.trip_messages
for select
to authenticated
using (
  public.is_trip_member(trip_owner_id, trip_id)
  and exists (
    select 1 from public.travel_trips as trips
    where trips.user_id = trip_owner_id
      and trips.id = trip_id
      and trips.deleted_at is null
  )
);
