-- Performance Pack 2: cover the active trip_invites owner/trip access path.
-- Used by trip deletion cleanup and the composite foreign-key relationship.

create index if not exists trip_invites_trip_idx
on public.trip_invites (trip_owner_id, trip_id);
