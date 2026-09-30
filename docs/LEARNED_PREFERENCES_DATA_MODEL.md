# Learned Preferences — Data Model Proposal

Status: Design only — NOT applied to Supabase
Target phase: TravelMate Personal Travel Intelligence

## Why a dedicated store is needed

Declared preferences are small, user-controlled values and are already stored in Supabase Auth `user_metadata`.

Learned preferences are different. They require durable:
- provenance/evidence references
- confidence
- review state
- correction/rejection/deletion state
- cross-trip querying
- dependency handling when a source trip is deleted

Those requirements are the implementation gate for moving learned intelligence out of Auth metadata.

## Proposed tables

### `public.travel_learned_preferences`

One row represents one learned hypothesis for one user.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `preference_key text not null`
- `value jsonb not null`
- `confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1)`
- `status text not null check (status in ('suggested','confirmed','rejected','deleted'))`
- `source_scope text not null check (source_scope in ('trip','cross_trip'))`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `reviewed_at timestamptz`
- `last_evidence_at timestamptz`

The table must never be used for authorization, RLS decisions, or security policy.

### `public.travel_learned_preference_evidence`

Evidence is kept separately so source deletion can be handled explicitly instead of leaving opaque references inside one JSON document.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `learned_preference_id uuid not null references public.travel_learned_preferences(id) on delete cascade`
- `source_trip_id text`
- `event_kind text not null`
- `event_ref text`
- `observed_at timestamptz`
- `weight numeric(4,3) check (weight >= 0 and weight <= 1)`
- `created_at timestamptz not null default now()`

When `source_trip_id` is present, it should reference the existing composite trip identity:

`(user_id, source_trip_id) -> travel_trips(user_id, id)`

with `ON DELETE CASCADE` for evidence rows.

This lets trip deletion remove dependent evidence without touching the learned-preference row itself. The application can then recompute confidence or mark the inference stale.

## RLS model

Both tables are private user-owned data.

For every table:

- enable RLS
- revoke access from `anon`
- grant required CRUD only to `authenticated`
- SELECT/UPDATE/DELETE use `(select auth.uid()) = user_id`
- INSERT uses `with check ((select auth.uid()) = user_id)`
- never permit a client to assign another user's `user_id`

The evidence table must additionally ensure that `learned_preference_id` belongs to the same `user_id`. This should be enforced by a database constraint/design rather than relying only on client validation.

## Review state rules

Allowed transitions:

- suggested -> confirmed
- suggested -> rejected
- suggested -> deleted
- confirmed -> rejected
- confirmed -> deleted
- rejected -> deleted

A rejected or deleted inference is never sent to Mate.

A rejected inference must remain represented long enough to prevent the same hypothesis from being immediately regenerated without new, materially different evidence.

## Evidence rules

Permitted evidence:
- completed itinerary/place facts
- saved places
- explicit user-created trip memories
- bounded expense aggregates
- declared preferences, only as corroborating context
- other non-sensitive trip facts already owned by TravelMate

Forbidden evidence:
- document contents
- receipt text
- vault contents
- credentials
- medical/private notes
- private collaboration messages
- passive/raw GPS history

## Confidence

Confidence is a system signal, not a user-facing score that pretends to be certainty.

Suggested interpretation:
- 0.00–0.39: weak candidate; normally do not surface
- 0.40–0.69: candidate for review
- 0.70–1.00: strong candidate, still not automatically authoritative

The UI should prefer human language such as "Mate noticed..." rather than displaying a raw percentage.

## Deletion behavior

1. Delete a source trip -> dependent evidence rows are removed.
2. Learned preferences remain until the intelligence layer reevaluates them.
3. Reevaluation may reduce confidence or mark the inference stale.
4. Delete learned preference -> retain a tombstone/rejection signal if needed to prevent immediate regeneration.
5. "Delete all learned preferences" removes or tombstones all learned rows according to the final product policy.

## Migration gate

Before this proposal becomes a migration:

1. implement and test the review state machine;
2. implement the context boundary that excludes forbidden sources;
3. add pgTAP RLS tests for both tables;
4. add source-trip deletion tests;
5. verify the composite trip foreign key against the current `travel_trips` schema;
6. test rollback on a Supabase development branch;
7. only then apply the migration to production.

No production schema change is part of the current PR.
