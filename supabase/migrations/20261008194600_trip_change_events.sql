-- Durable collaborative trip change events and per-member read state.
-- Events are generated only after a successful persisted trip UPDATE.

create schema if not exists private;
revoke all on schema private from public;

create table public.trip_change_events (
  id bigint generated always as identity primary key,
  trip_owner_id uuid not null,
  trip_id text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  mutation_id uuid not null,
  revision bigint not null check (revision > 0),
  entity_type text not null check (char_length(entity_type) between 1 and 32),
  entity_id text,
  action text not null check (char_length(action) between 1 and 32),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 2048),
  severity text not null default 'info' check (severity in ('info','important','critical')),
  created_at timestamptz not null default clock_timestamp(),
  constraint trip_change_events_trip_fk foreign key (trip_owner_id, trip_id)
    references public.travel_trips(user_id, id) on delete cascade,
  constraint trip_change_events_mutation_unique unique (trip_owner_id, trip_id, mutation_id)
);

create index trip_change_events_trip_order_idx
  on public.trip_change_events (trip_owner_id, trip_id, id);
create index trip_change_events_trip_created_idx
  on public.trip_change_events (trip_owner_id, trip_id, created_at, id);

create table public.trip_change_read_state (
  trip_owner_id uuid not null,
  trip_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_event_id bigint,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (trip_owner_id, trip_id, user_id),
  constraint trip_change_read_state_trip_fk foreign key (trip_owner_id, trip_id)
    references public.travel_trips(user_id, id) on delete cascade,
  constraint trip_change_read_state_event_nonnegative check (last_read_event_id is null or last_read_event_id > 0)
);

alter table public.trip_change_events enable row level security;
alter table public.trip_change_read_state enable row level security;

revoke all on table public.trip_change_events from anon, authenticated;
revoke all on table public.trip_change_read_state from anon, authenticated;
grant select on table public.trip_change_events to authenticated;
grant select, insert, update on table public.trip_change_read_state to authenticated;
revoke all on sequence public.trip_change_events_id_seq from anon, authenticated;

drop policy if exists "Members read visible trip change events" on public.trip_change_events;
create policy "Members read visible trip change events"
on public.trip_change_events
for select
to authenticated
using (
  (select auth.uid()) is not null
  and public.is_trip_member(trip_owner_id, trip_id)
  and exists (
    select 1
    from public.trip_members m
    where m.trip_owner_id = trip_change_events.trip_owner_id
      and m.trip_id = trip_change_events.trip_id
      and m.user_id = (select auth.uid())
      and trip_change_events.created_at >= m.joined_at
  )
  and exists (
    select 1 from public.travel_trips t
    where t.user_id = trip_change_events.trip_owner_id
      and t.id = trip_change_events.trip_id
      and t.deleted_at is null
  )
);

drop policy if exists "MFA protects trip change events" on public.trip_change_events;
create policy "MFA protects trip change events"
on public.trip_change_events
as restrictive
for all
to authenticated
using ((select public.mfa_satisfied_if_enrolled()))
with check ((select public.mfa_satisfied_if_enrolled()));

drop policy if exists "Members read own trip change state" on public.trip_change_read_state;
create policy "Members read own trip change state"
on public.trip_change_read_state
for select
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_trip_member(trip_owner_id, trip_id)
  and exists (
    select 1 from public.travel_trips t
    where t.user_id = trip_change_read_state.trip_owner_id
      and t.id = trip_change_read_state.trip_id
      and t.deleted_at is null
  )
);

drop policy if exists "Members create own trip change state" on public.trip_change_read_state;
create policy "Members create own trip change state"
on public.trip_change_read_state
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_trip_member(trip_owner_id, trip_id)
  and exists (
    select 1 from public.travel_trips t
    where t.user_id = trip_change_read_state.trip_owner_id
      and t.id = trip_change_read_state.trip_id
      and t.deleted_at is null
  )
  and (
    last_read_event_id is null
    or exists (
      select 1 from public.trip_change_events e
      where e.id = trip_change_read_state.last_read_event_id
        and e.trip_owner_id = trip_change_read_state.trip_owner_id
        and e.trip_id = trip_change_read_state.trip_id
    )
  )
);

drop policy if exists "Members update own trip change state" on public.trip_change_read_state;
create policy "Members update own trip change state"
on public.trip_change_read_state
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_trip_member(trip_owner_id, trip_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_trip_member(trip_owner_id, trip_id)
  and exists (
    select 1 from public.travel_trips t
    where t.user_id = trip_change_read_state.trip_owner_id
      and t.id = trip_change_read_state.trip_id
      and t.deleted_at is null
  )
  and (
    last_read_event_id is null
    or exists (
      select 1 from public.trip_change_events e
      where e.id = trip_change_read_state.last_read_event_id
        and e.trip_owner_id = trip_change_read_state.trip_owner_id
        and e.trip_id = trip_change_read_state.trip_id
    )
  )
);

drop policy if exists "MFA protects trip change read state" on public.trip_change_read_state;
create policy "MFA protects trip change read state"
on public.trip_change_read_state
as restrictive
for all
to authenticated
using ((select public.mfa_satisfied_if_enrolled()))
with check ((select public.mfa_satisfied_if_enrolled()));

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
  changed_count integer;
  event_entity text;
  event_summary jsonb;
begin
  if old.deleted_at is not null
     or new.deleted_at is not null
     or old.revision is not distinct from new.revision
     or new.last_mutation_id is null
     or new.last_mutation_by is null then
    return new;
  end if;

  plan_changed :=
    old.payload -> 'activities' is distinct from new.payload -> 'activities'
    or old.payload -> 'dayNotes' is distinct from new.payload -> 'dayNotes';
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
    event_entity, null, 'updated', event_summary,
    case when trip_details_changed or transport_changed or lodging_changed then 'important' else 'info' end
  )
  on conflict (trip_owner_id, trip_id, mutation_id) do nothing;

  return new;
end;
$$;

revoke all on function private.log_trip_change_event() from public, anon, authenticated;

drop trigger if exists trip_change_event_after_update on public.travel_trips;
create trigger trip_change_event_after_update
after update of country, city, start_date, end_date, budget, trip_type, days, payload, revision, last_mutation_id, last_mutation_by, deleted_at
on public.travel_trips
for each row
when (old.deleted_at is null and new.deleted_at is null and old.revision is distinct from new.revision)
execute function private.log_trip_change_event();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trip_change_events'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_change_events';
  end if;
end;
$$;
