alter table public.trip_change_events
  add constraint trip_change_events_entity_id_length
  check (entity_id is null or char_length(entity_id) between 1 and 180);

create or replace function private.single_changed_record_id(p_old jsonb, p_new jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  with old_rows as (
    select value ->> 'id' as id, value as record
    from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]'::jsonb end)
    where nullif(value ->> 'id', '') is not null
  ), new_rows as (
    select value ->> 'id' as id, value as record
    from jsonb_array_elements(case when jsonb_typeof(p_new) = 'array' then p_new else '[]'::jsonb end)
    where nullif(value ->> 'id', '') is not null
  ), ids as (
    select id from old_rows
    union
    select id from new_rows
  ), changed as (
    select ids.id
    from ids
    left join old_rows o using (id)
    left join new_rows n using (id)
    where o.record is distinct from n.record
  )
  select case when count(*) = 1 then min(id) end
  from changed;
$$;

revoke all on function private.single_changed_record_id(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.log_trip_change_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_changed boolean;
  places_changed boolean;
  budget_changed boolean;
  transport_changed boolean;
  lodging_changed boolean;
  trip_details_changed boolean;
  day_notes_changed boolean;
  changed_count integer;
  event_entity text;
  event_entity_id text;
  event_action text := 'updated';
  event_summary jsonb;
begin
  if old.deleted_at is not null
     or new.deleted_at is not null
     or old.revision is not distinct from new.revision
     or new.last_mutation_id is null
     or new.last_mutation_by is null then
    return new;
  end if;

  day_notes_changed := old.payload -> 'dayNotes' is distinct from new.payload -> 'dayNotes';
  plan_changed :=
    old.payload -> 'activities' is distinct from new.payload -> 'activities'
    or day_notes_changed;
  places_changed := old.payload -> 'savedPlaces' is distinct from new.payload -> 'savedPlaces';
  budget_changed :=
    old.budget is distinct from new.budget
    or old.payload -> 'expenses' is distinct from new.payload -> 'expenses'
    or old.payload -> 'budgetUnlimited' is distinct from new.payload -> 'budgetUnlimited'
    or old.payload -> 'budgetCategories' is distinct from new.payload -> 'budgetCategories';
  transport_changed :=
    old.payload -> 'transport' is distinct from new.payload -> 'transport'
    or old.payload -> 'flights' is distinct from new.payload -> 'flights';
  lodging_changed :=
    old.payload -> 'lodging' is distinct from new.payload -> 'lodging'
    or old.payload -> 'hotel' is distinct from new.payload -> 'hotel'
    or old.payload -> 'hotels' is distinct from new.payload -> 'hotels'
    or old.payload -> 'accommodation' is distinct from new.payload -> 'accommodation';
  trip_details_changed :=
    old.country is distinct from new.country
    or old.city is distinct from new.city
    or old.start_date is distinct from new.start_date
    or old.end_date is distinct from new.end_date
    or old.trip_type is distinct from new.trip_type
    or old.days is distinct from new.days;

  changed_count :=
    plan_changed::integer + places_changed::integer + budget_changed::integer
    + transport_changed::integer + lodging_changed::integer + trip_details_changed::integer;

  if changed_count = 0 then
    return new;
  end if;

  event_entity := case
    when changed_count <> 1 then 'trip'
    when plan_changed then 'plan'
    when places_changed then 'places'
    when budget_changed then 'budget'
    when transport_changed then 'transport'
    when lodging_changed then 'lodging'
    else 'trip'
  end;

  if changed_count = 1 and plan_changed and not day_notes_changed then
    event_entity_id := private.single_changed_record_id(old.payload -> 'activities', new.payload -> 'activities');
    if event_entity_id is not null then
      event_entity := 'activity';
      if not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(old.payload -> 'activities')='array' then old.payload -> 'activities' else '[]'::jsonb end) x
        where x ->> 'id' = event_entity_id
      ) then event_action := 'added';
      elsif not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(new.payload -> 'activities')='array' then new.payload -> 'activities' else '[]'::jsonb end) x
        where x ->> 'id' = event_entity_id
      ) then event_action := 'removed';
      end if;
    end if;
  elsif changed_count = 1 and places_changed then
    event_entity_id := private.single_changed_record_id(old.payload -> 'savedPlaces', new.payload -> 'savedPlaces');
    if event_entity_id is not null then
      event_entity := 'place';
      if not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(old.payload -> 'savedPlaces')='array' then old.payload -> 'savedPlaces' else '[]'::jsonb end) x
        where x ->> 'id' = event_entity_id
      ) then event_action := 'added';
      elsif not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(new.payload -> 'savedPlaces')='array' then new.payload -> 'savedPlaces' else '[]'::jsonb end) x
        where x ->> 'id' = event_entity_id
      ) then event_action := 'removed';
      end if;
    end if;
  end if;

  event_summary := jsonb_strip_nulls(jsonb_build_object(
    'plan_changed', case when plan_changed then true end,
    'places_changed', case when places_changed then true end,
    'budget_changed', case when budget_changed then true end,
    'transport_changed', case when transport_changed then true end,
    'lodging_changed', case when lodging_changed then true end,
    'trip_details_changed', case when trip_details_changed then true end
  ));

  insert into public.trip_change_events (
    trip_owner_id, trip_id, actor_user_id, mutation_id, revision,
    entity_type, entity_id, action, summary, severity
  ) values (
    new.user_id, new.id, new.last_mutation_by, new.last_mutation_id, new.revision,
    event_entity, event_entity_id, event_action, event_summary,
    case when trip_details_changed or transport_changed or lodging_changed then 'important' else 'info' end
  )
  on conflict (trip_owner_id, trip_id, mutation_id) do nothing;

  return new;
end;
$$;

revoke all on function private.log_trip_change_event() from public, anon, authenticated;

create or replace function public.mark_trip_changes_read(p_owner uuid, p_trip_id text, p_event_id bigint)
returns bigint
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  actor_id uuid := auth.uid();
  visible_event_id bigint;
  final_event_id bigint;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.mfa_satisfied_if_enrolled() then
    raise exception 'MFA required' using errcode = '42501';
  end if;
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'Invalid event id' using errcode = '22023';
  end if;

  select e.id into visible_event_id
  from public.trip_change_events e
  join public.trip_members m
    on m.trip_owner_id=e.trip_owner_id and m.trip_id=e.trip_id and m.user_id=actor_id
  join public.travel_trips t
    on t.user_id=e.trip_owner_id and t.id=e.trip_id and t.deleted_at is null
  where e.id=p_event_id
    and e.trip_owner_id=p_owner
    and e.trip_id=p_trip_id
    and e.created_at >= m.joined_at;

  if visible_event_id is null then
    raise exception 'Event unavailable' using errcode = 'P0002';
  end if;

  insert into public.trip_change_read_state (trip_owner_id, trip_id, user_id, last_read_event_id, updated_at)
  values (p_owner, p_trip_id, actor_id, visible_event_id, clock_timestamp())
  on conflict (trip_owner_id, trip_id, user_id) do update
  set last_read_event_id = greatest(coalesce(public.trip_change_read_state.last_read_event_id, 0), excluded.last_read_event_id),
      updated_at = clock_timestamp();

  select last_read_event_id into final_event_id
  from public.trip_change_read_state
  where trip_owner_id=p_owner and trip_id=p_trip_id and user_id=actor_id;

  return final_event_id;
end;
$$;

revoke all on function public.mark_trip_changes_read(uuid, text, bigint) from public, anon;
grant execute on function public.mark_trip_changes_read(uuid, text, bigint) to authenticated;

revoke insert, update on table public.trip_change_read_state from authenticated;
grant select on table public.trip_change_read_state to authenticated;
