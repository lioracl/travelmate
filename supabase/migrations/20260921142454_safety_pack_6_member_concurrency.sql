-- Safety Pack 6: serialize collaborator role/removal changes with trip saves.

create or replace function public.save_travel_trip(
  p_owner_id uuid,
  p_trip_id text,
  p_expected_revision bigint,
  p_expected_updated_at timestamptz,
  p_mutation_id uuid,
  p_trip jsonb
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
  actor_role text;
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

  if actor_id <> p_owner_id then
    select role into actor_role
    from public.trip_members
    where trip_owner_id = p_owner_id
      and trip_id = p_trip_id
      and user_id = actor_id
    for update;

    if actor_role is distinct from 'editor' then
      raise exception 'Trip edit forbidden' using errcode = '42501';
    end if;
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
$function$;

create or replace function public.update_trip_member_role(
  p_trip_owner_id uuid,
  p_trip_id text,
  p_user_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := auth.uid();
  current_trip public.travel_trips%rowtype;
  normalized_role text;
begin
  if actor_id is null or actor_id <> p_trip_owner_id then
    raise exception 'Only the trip owner can change member roles' using errcode = '42501';
  end if;

  if not public.mfa_satisfied_if_enrolled() then
    raise exception 'MFA required' using errcode = '42501';
  end if;

  if p_user_id = p_trip_owner_id then
    raise exception 'Owner role cannot be changed' using errcode = '42501';
  end if;

  normalized_role := case when p_role = 'viewer' then 'viewer' else 'editor' end;

  select * into current_trip
  from public.travel_trips
  where user_id = p_trip_owner_id and id = p_trip_id
  for update;

  if not found or current_trip.deleted_at is not null then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.trip_members
  where trip_owner_id = p_trip_owner_id
    and trip_id = p_trip_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  update public.trip_members
  set role = normalized_role
  where trip_owner_id = p_trip_owner_id
    and trip_id = p_trip_id
    and user_id = p_user_id;

  return normalized_role;
end;
$function$;

create or replace function public.remove_trip_member(
  p_trip_owner_id uuid,
  p_trip_id text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := auth.uid();
  current_trip public.travel_trips%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.mfa_satisfied_if_enrolled() then
    raise exception 'MFA required' using errcode = '42501';
  end if;

  if p_user_id = p_trip_owner_id then
    raise exception 'Trip owner cannot be removed' using errcode = '42501';
  end if;

  if actor_id <> p_trip_owner_id and actor_id <> p_user_id then
    raise exception 'Member removal forbidden' using errcode = '42501';
  end if;

  select * into current_trip
  from public.travel_trips
  where user_id = p_trip_owner_id and id = p_trip_id
  for update;

  if not found or current_trip.deleted_at is not null then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.trip_members
  where trip_owner_id = p_trip_owner_id
    and trip_id = p_trip_id
    and user_id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  delete from public.trip_members
  where trip_owner_id = p_trip_owner_id
    and trip_id = p_trip_id
    and user_id = p_user_id;

  return true;
end;
$function$;

revoke all on function public.update_trip_member_role(uuid,text,uuid,text) from public;
grant execute on function public.update_trip_member_role(uuid,text,uuid,text) to authenticated, service_role;

revoke all on function public.remove_trip_member(uuid,text,uuid) from public;
grant execute on function public.remove_trip_member(uuid,text,uuid) to authenticated, service_role;

revoke update, delete on table public.trip_members from authenticated;
