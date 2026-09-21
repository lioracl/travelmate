-- Performance Pack 1: avoid per-row auth.uid() re-evaluation in RLS policies.
-- Semantics are unchanged; only wrap auth.uid() in a SELECT initplan.

drop policy if exists "Members leave trips" on public.trip_members;
create policy "Members leave trips"
on public.trip_members
for delete
to authenticated
using (
  user_id <> trip_owner_id
  and (((select auth.uid()) = user_id) or ((select auth.uid()) = trip_owner_id))
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
  (select auth.uid()) = trip_owner_id
  and exists (
    select 1 from public.travel_trips as trips
    where trips.user_id = trip_owner_id
      and trips.id = trip_id
      and trips.deleted_at is null
  )
)
with check (
  (select auth.uid()) = trip_owner_id
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
  (((select auth.uid()) = sender_user_id) or ((select auth.uid()) = trip_owner_id))
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
  (select auth.uid()) = sender_user_id
  and public.is_trip_member(trip_owner_id, trip_id)
  and exists (
    select 1 from public.travel_trips as trips
    where trips.user_id = trip_owner_id
      and trips.id = trip_id
      and trips.deleted_at is null
  )
);
