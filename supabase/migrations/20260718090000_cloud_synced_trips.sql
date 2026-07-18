create table if not exists public.travel_trips (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  country text not null,
  city text not null,
  start_date date not null,
  end_date date not null,
  budget numeric not null default 0 check (budget >= 0),
  trip_type text not null default 'סולו',
  days integer not null check (days between 1 and 60),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists travel_trips_user_updated_idx
  on public.travel_trips (user_id, updated_at desc);

alter table public.travel_trips enable row level security;

drop policy if exists "Users read their own trips" on public.travel_trips;
create policy "Users read their own trips"
  on public.travel_trips for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own trips" on public.travel_trips;
create policy "Users add their own trips"
  on public.travel_trips for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own trips" on public.travel_trips;
create policy "Users update their own trips"
  on public.travel_trips for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own trips" on public.travel_trips;
create policy "Users delete their own trips"
  on public.travel_trips for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.travel_trips from anon;
grant select, insert, update, delete on table public.travel_trips to authenticated;
