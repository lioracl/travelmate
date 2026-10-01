-- DRAFT ONLY — DO NOT APPLY DIRECTLY.
-- Personal Travel Intelligence persistence for V2.
-- Apply only after Profile Center review UX and RLS tests are complete.
-- No destructive statements are included.

create extension if not exists pgcrypto;

create table if not exists public.travel_learned_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  preference_key text not null,
  preference_value text not null,
  review_state text not null default 'suggested'
    check (review_state in ('suggested','confirmed','rejected','deleted')),
  source_scope text not null default 'trip'
    check (source_scope in ('trip','cross_trip')),
  confidence numeric(4,3) not null default 0
    check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id, preference_key, preference_value)
);

create table if not exists public.travel_learned_preference_evidence (
  id uuid primary key default gen_random_uuid(),
  learned_preference_id uuid not null
    references public.travel_learned_preferences(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_trip_id text not null,
  source_event_kind text not null
    check (source_event_kind in (
      'completed_activity',
      'completed_place',
      'saved_place',
      'expense_aggregate',
      'declared_preference'
    )),
  source_event_ref text not null,
  observed_at timestamptz,
  weight numeric(4,3) not null default 0.5
    check (weight >= 0 and weight <= 1),
  created_at timestamptz not null default now(),
  unique (
    learned_preference_id,
    source_trip_id,
    source_event_kind,
    source_event_ref
  )
);

create index if not exists travel_learned_preferences_user_state_idx
  on public.travel_learned_preferences (user_id, review_state, updated_at desc);

create index if not exists travel_learned_preference_evidence_user_trip_idx
  on public.travel_learned_preference_evidence (user_id, source_trip_id);

alter table public.travel_learned_preferences enable row level security;
alter table public.travel_learned_preference_evidence enable row level security;

-- Ownership boundary: a user can only read/write their own learned preferences.
create policy "Users read their own learned preferences"
  on public.travel_learned_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own learned preferences"
  on public.travel_learned_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own learned preferences"
  on public.travel_learned_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own learned preferences"
  on public.travel_learned_preferences for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Evidence is user-owned AND must point to a trip owned by that same user.
create policy "Users read their own learning evidence"
  on public.travel_learned_preference_evidence for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add owned trip learning evidence"
  on public.travel_learned_preference_evidence for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.travel_trips t
      where t.user_id = (select auth.uid())
        and t.id = source_trip_id
        and t.deleted_at is null
    )
    and exists (
      select 1
      from public.travel_learned_preferences p
      where p.id = learned_preference_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "Users delete their own learning evidence"
  on public.travel_learned_preference_evidence for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.travel_learned_preferences from anon;
revoke all on table public.travel_learned_preference_evidence from anon;

grant select, insert, update, delete
  on public.travel_learned_preferences
  to authenticated;

grant select, insert, delete
  on public.travel_learned_preference_evidence
  to authenticated;

-- Intentionally missing:
-- * automatic inference trigger;
-- * automatic confirmation;
-- * cross-trip aggregation inside SQL;
-- * document/private-content access;
-- * shared-trip evidence;
-- * destructive cleanup migration.
-- These must remain application-controlled and user-reviewed.
