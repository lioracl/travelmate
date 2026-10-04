# TravelMate Learned Preferences — 2.15

## Status
Implemented for 2.15.0. This document supersedes the earlier two-table design draft. Declared preferences remain in the existing Supabase Auth user metadata; only learned, reviewed intelligence gets a dedicated table.

## Scope
2.15 learns only non-sensitive **interest** patterns from structured records that the user marked `done=true` in at least two trips that:
- belong to the authenticated user;
- have ended before the current local day;
- are not deleted or pending deletion.

For saved/place records, the record must also be scheduled/dated. Shared or foreign trips, ownerless trips, future/current trips, unscheduled ideas, documents, receipts, vault content, credentials, private notes/messages, raw GPS, coordinates and transport inference are not learning sources.

## Persistence
`public.learned_travel_preferences` stores one row per stable owner/candidate key.

Core fields:
- `user_id` — authenticated owner.
- `candidate_key` — stable `cross-trip:interests:<suggested-value>` identity.
- `preference_key` — fixed to `interests` in 2.15.
- `suggested_value` — original inferred value and immutable provenance.
- `value` — current value; a user correction changes this while preserving `suggested_value`.
- `confidence` — bounded 0..1.
- `review_state` — `suggested`, `confirmed`, or `rejected`.
- `source_scope` — fixed to `cross_trip`.
- `evidence` — at most 12 opaque structured references containing **only** `sourceTripId`, `eventKind`, `eventRef`.
- `evidence_active` — whether current evidence still satisfies the two-completed-owned-trips gate.
- `revision` — server-managed optimistic-concurrency token.
- server-managed timestamps.

The database validates exact evidence keys/types, allowed event kinds, bounded IDs, at least two distinct trip IDs when active, and verifies that each active source trip is an owned, non-deleted trip whose end date is before today.

## Security
The table uses forced RLS. Authenticated clients receive **SELECT only** through owner + restrictive MFA policies; direct INSERT/UPDATE/DELETE is revoked. All mutations go through owner-bound `SECURITY DEFINER` RPCs with hardened search paths, explicit MFA checks, authoritative Auth consent checks where learning is created/confirmed, revision CAS, and server-side validation of every evidence record against the current owned trip payload. A trigger still protects immutable provenance fields, legal review-state transitions, server timestamps and revisions.

## Review semantics
- **Confirm**: `suggested → confirmed`.
- **Correct**: preserve `suggested_value`, change `value`, and confirm.
- **Reject**: durable suppression. Regeneration never overwrites a rejected row.
- **Delete one**: physical deletion. If learning remains enabled and the same eligible pattern still exists, it may be learned again on the next refresh; the UI states this explicitly.
- **Delete all**: first set `learningEnabled=false` in Auth metadata, then call the owner-bound delete-all RPC. Learning/sync RPCs lock the Auth user row while checking consent, so a concurrent learning write cannot bypass a committed disable. If cleanup fails, learning remains disabled and the UI reports incomplete cleanup.

Generated evidence refreshes do not overwrite confirmed/rejected review decisions. If evidence for a confirmed row disappears, it becomes `evidence_active=false`; it remains visible as previously approved but is no longer exported to Mate.

## Mate boundary
Mate receives only the final allowed interest value through `travelmate_confirmed_learned_preferences()`. The RPC rechecks authoritative Auth consent and validates every evidence reference against the current trip payload (record exists, is completed, is scheduled where required, category still supports the inferred interest). Export occurs only when all are true:
- the active authenticated owner matches;
- `learningEnabled === true`;
- `review_state === 'confirmed'`;
- `evidence_active === true`;
- the value belongs to the fixed 2.15 interest vocabulary.

Mate never receives evidence IDs, confidence, rejected rows, source names, private text or GPS. Declared preferences and learned preferences remain separate in prompt construction; declared user choices win if they conflict. Learned preferences may shape recommendations but cannot automatically schedule, rank, book, navigate or perform actions.

## Offline and account switching
There is no offline learned-data queue and no learned-data copy in the general trip cache. Offline learned personalization fails closed to declared preferences only. Every cloud mutation captures and rechecks the authenticated owner; UI refresh generations discard stale account responses and clear old-account content on account changes.
