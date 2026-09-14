# TravelMate Stabilization: Phase 0–1

Audit date: 2026-09-13
Repository: `lioracl/travelmate`
Branch and baseline: `preview` at `59c042dfc7fdb03696e351f30beaaf16c9bbd77c`

## Baseline and architecture

TravelMate is a static, multi-entry HTML/CSS/JavaScript PWA. The primary entry points are `index.html`, `trip/custom/index.html`, `trip/italy-2028/index.html`, and `trip/japan-2027/index.html`. There is no package manager or application build step. `sw.js` is the active service worker (`travelmate-smart-v135`, asset version `20260913-2`) and uses release-versioned first-party JS/CSS cache keys.

Client trip state is stored in `localStorage` under `travelmate-trips`, with per-account recovery snapshots under `travelmate-trips-user:<user-id>`. `assets/cloud-sync.js` synchronizes trips with Supabase `travel_trips`; authentication uses Supabase Auth. Encrypted uploaded documents use the private `travel-documents` Storage bucket plus `travel_documents` metadata. Navo uses the `travel-assistant` Edge Function. Phase 1.5 verified the deployed RLS definitions and anonymous/non-member denial behavior against project `hyaebqvwvdnbmvijnjcf` using read-only queries. Owner/editor/viewer and MFA behavior were not exercised end to end because isolated authenticated role fixtures were unavailable.

Pre-existing uncommitted work in `assets/home-organizer.css`, `assets/theme.css`, and `index.html`, plus local `.codex-*` directories, was preserved and excluded from this phase. The Italy static trip remains present and loaded successfully in local Chromium. No repository-backed static Israel fixture was found; no user storage or live account was mutated, so the user's Israel test trip was left untouched but could not be functionally exercised.

Status definitions: **verified working** means exercised locally or by an isolated automated test; **implemented but unverified** means the code path and UI exist but were not exercised with its external/authenticated dependency; **partially working** means a verified subpath exists with remaining unverified or known-risk behavior; **planned only** means no complete active implementation was found.

## Verified feature inventory

| Feature | Entry point and implementation | User capability and persistence | Status | Dependencies and evidence |
|---|---|---|---|---|
| Trip list and switching | `index.html`; `assets/home.js` (`renderTrips`, `tripCard`) | View active/archive trips and open static or custom trips; local + `travel_trips` | Partially working | Home and Italy entry points loaded locally; authenticated cloud list not tested |
| Trip creation | home destination form; `assets/home.js`; `assets/trip-intelligence.js` | Create custom trip and optionally attach a pending Navo recommendation | Implemented but unverified | Requires interactive form and, for cloud confirmation, Supabase Auth |
| Trip date editing, active/archive, deletion | `assets/home.js` | Edit dates, mark active, auto/archive, delete custom trips | Implemented but unverified | Local state plus `TravelMateCloud`; static cards are protected from edit/delete UI |
| Overview and quick actions | trip entry pages; `assets/custom-trip.js`, `assets/app.js` | View trip identity, weather, budget, next actions, and jump to sections | Partially working | Italy Overview rendered locally; populated custom data not exercised |
| Daily plan | `assets/auto-planner.js`, `assets/app.js`, `assets/smart-plan-tools.js` | Create/reorder/edit activities, day notes, overlap warning, replace suggestions | Implemented but unverified | Trip local/cloud payload; external place enrichment for some actions |
| Calendar export | `assets/app.js` | Export planned activities to calendar links/files | Implemented but unverified | Browser calendar/download behavior |
| Places search | `assets/nearby.js`, `assets/app.js` | Category/multi-select/free search, kosher filters, Near Me, destination/map search | Implemented but unverified | Geolocation, Overpass, Nominatim, MapLibre/OpenFreeMap |
| Places result actions | `assets/nearby.js`, `assets/place-directions.js`, `assets/place-sharing.css` | Directions, native/WhatsApp share, official site, Google Maps, Wikipedia/source | Implemented but unverified | External URLs and Web Share API vary by device |
| Saved places and itinerary scheduling | `assets/app.js`, `assets/place-auto-fill.js` | Save a place, choose trip day/time, add to itinerary, replace suggestions | Implemented but unverified | Local/cloud trip payload; stable result IDs and lazy time options |
| Map/list synchronization | `assets/nearby.js` | Select map point/marker, search area, show enriched detail | Implemented but unverified | MapLibre, OpenFreeMap, Nominatim, Wikidata/Wikipedia |
| Weather | `assets/weather-widget.js` | Destination weather and forecast | Implemented but unverified | Open-Meteo network APIs and cache |
| Document vault | `assets/document-vault.js` | Upload, categorize, encrypt, list, preview, download, and delete files | Implemented but unverified | Supabase Auth/MFA, Web Crypto, private Storage, `travel_documents` RLS |
| Saved Navo notes | `assets/ai-assistant.js`, `assets/trip-intelligence.js` | Save, open, copy, and delete AI answers/recommendations per trip | Verified working (logic) | Isolated data-integrity tests pass; authenticated live write not performed |
| Navo assistant | `assets/ai-assistant.js` | Ask questions, continue truncated answers, retain session history, save a response | Partially working | UI/code present; request requires Auth + `travel-assistant`; save logic tested synthetically |
| Trip Intelligence | `assets/trip-intelligence.js` | Generate context-aware recommendations for new/existing trips and ask follow-ups | Partially working | Context normalization/rendering present; delayed-response trip isolation tested; live AI call not made |
| Budget and expenses | `assets/trip-experience.js` | Set total budget, track categories/expenses, secondary currency, receipts | Implemented but unverified | Trip payload, exchange-rate APIs, IndexedDB/private receipt path |
| Lodging | `assets/lodging-manager.js`, Places hotel form in `assets/app.js` | Save lodging/base, link it to an activity, navigate to it | Implemented but unverified | Nominatim and trip persistence |
| Transportation | `assets/transport-planner.js`, `assets/travel-services.js` | Store transport details and open relevant services | Implemented but unverified | External transport/service URLs |
| Sharing and collaboration | `assets/collaboration.js`, `assets/cloud-sync.js` | Invite viewer/editor, manage members, group chat, share place cards | Implemented but unverified | Auth, RLS/RPC functions, Realtime, Web Share/clipboard |
| Offline/install/update | `sw.js`, `manifest.webmanifest`, `assets/network-usage.js` | Install PWA, use cached shell/assets, receive release updates, inspect network status | Partially working | Local service worker registered; offline transition/update was not destructively simulated |
| Theme and language | `assets/theme.js`, `assets/language.js` | Light/dark and Hebrew/English preferences | Implemented but unverified | Browser storage and dynamically translated DOM |
| Security/account center | `assets/security-center.js`, `assets/cloud-sync.js` | Sign in/up/out, reset password, manage MFA/device data | Implemented but unverified | Supabase Auth and Turnstile; no credentials were used |
| Admin center | `assets/admin-center.js`, Supabase admin migration/function | Admin settings, roles, audit data | Implemented but unverified | Server-side admin authorization and Edge Function |
| Memories and album | `assets/trip-experience.js` | Store memories and photo-album URL | Implemented but unverified | Trip payload and external album URL |
| Smart Hub / contextual actions | `assets/smart-hub.js`, `assets/smart-plan-tools.js` | Surface contextual next actions and replacement tools | Implemented but unverified | Depends on current trip/view data |

## Data-integrity trace and findings

The saved Navo-note path is now explicit: the response returned by `TravelMateNavo.request` is normalized into the originating Trip Intelligence state, rendered from `state.recommendation.body`, and saved from that same recommendation value through `saveNoteForTrip`/`appendNote`. Metadata carries both `tripId` and a stable `responseId`. The AI prompt and full trip context remain inputs to the Edge Function and are not used as saved note content.

Three root causes were confirmed:

1. `generate()` used the mutable global `state` after awaiting the AI response. Switching trip context during the request could therefore write the completed response into the newly active trip state.
2. AI-note duplicate prevention compared only question and answer text. That stopped repeated clicks, but it also collapsed distinct response records that happened to contain identical text.
3. Cloud writes for the same trip could overlap. The client set `cloudUpdatedAt` before network confirmation, and an older request could complete after a newer local edit.

The Phase 1 correction captures the originating state/context/request identity before an AI request, uses `responseId` as the idempotency key, snapshots queued trip writes, serializes writes per trip identity, records local `pending`/`failed`/`synced` state, advances `cloudUpdatedAt` only after confirmation, and refuses to apply an older confirmation over a newer local revision. No database schema or encryption format changed.

The current merge strategy remains last-edit-wins by client timestamp. Serialization prevents same-client late completion, but it does not provide a server-enforced revision/CAS guarantee for simultaneous edits from different devices. That broader conflict-control change remains a later controlled migration.

## Verification and execution log

- PASS: branch and baseline verified; pre-existing changes identified and preserved.
- PASS: `index.html` and `trip/italy-2028/index.html` loaded with meaningful content in local Chromium.
- PASS: all four application entry files and all first-party JS/CSS paths referenced by them exist.
- PASS: Node syntax checks for every JavaScript file changed in Phase 1.
- PASS: `git diff --check`.
- PASS: synthetic delayed Trip Intelligence response remained attached to its originating trip state after a context switch.
- PASS: repeated save of one `responseId` was rejected while two distinct response IDs with identical visible text were both retained.
- PASS: two synthetic same-trip cloud writes ran sequentially and the older confirmation did not replace the newer local payload.
- PASS: a simulated offline write failure retained the local trip, marked it `failed`, and did not falsely advance `cloudUpdatedAt`.
- NOT TESTED: authenticated Supabase document upload/open/delete, live Navo generation, collaboration, MFA, and cross-device synchronization; no legitimate test credentials or isolated remote fixture were used.
- NOT TESTED: real offline-to-online browser restart and service-worker update transition.
- BLOCKED: server-side authorization proof against the deployed Supabase project. Repository migrations show owner/member RLS, but source review is not proof of deployed policy state.
- PRESERVED: Italy static trip source and all user storage. No repository static Israel fixture was found, and no real browser profile/user data was modified.

## Deferred product and design work

The existing white/low-contrast document actions, Navo response contrast, recommendation close-button alignment, long modal reachability, and drag-only accessibility alternatives were recorded for the visual/accessibility phase. Navigation, global CSS/material cleanup, and new product features were intentionally excluded.

Recommended next work is an authenticated, isolated end-to-end persistence run, followed by a server-verified RLS/policy audit and then the already scoped mobile visual/accessibility phase. A cross-device conflict design should add server-enforced revisions rather than extending client timestamp arbitration.

## Phase 1.5 validation evidence

Phase 1.5 was run against the same `preview` baseline, `59c042dfc7fdb03696e351f30beaaf16c9bbd77c`. The Phase 0/1 implementation remains local and uncommitted. The deployed PWA graph remains `travelmate-smart-v135` with asset version `20260913-2`; none of the Phase 0/1 changes described here is live. Pre-existing work in `assets/home-organizer.css`, `assets/theme.css`, and `index.html`, and the `.codex-*` directories, remains outside this stabilization unit.

### Additional Phase 1 defects reproduced and corrected locally

Deterministic tests first reproduced each client-side defect below. The fixes are limited to `assets/cloud-sync.js` and the regression suite.

1. **Account switch during full synchronization:** one global full-sync promise allowed User B to reuse User A's in-flight synchronization and could merge A's result into B's active local storage. Synchronization is now coalesced per active user, captures the initiating user ID, and revalidates it before each local merge/write.
2. **Account switch during a save/read/subscription:** a late save acknowledgement, `getTrip()` result, or Realtime callback could act after the active account changed. Save operations now carry the initiating user identity; delayed reads and subscription callbacks are discarded when that identity is no longer active.
3. **Deletion followed by a stale async result:** a delayed `getTrip()`, full-sync list, or Realtime update could recreate a trip deleted earlier in the same page lifetime. All three incoming paths now consult the existing deletion tombstone before accepting or merging a trip.
4. **First ownerless save:** after authentication assigned an owner to the queued snapshot, the exact identity lookup could miss the ownerless local record and leave it pending. The local lookup now falls back safely by ID, copies the assigned owner, and records the confirmed synchronized state.
5. **Reconnect acknowledgement:** persisted `pending`/`failed` state reconstructs retry work after a fresh runtime. The regression test now holds the network acknowledgement open and proves that status remains `pending` until the real confirmation arrives, then becomes `synced`, with one upload.

The local test suite now covers 27 deterministic scenarios. Evidence includes AI response identity, duplicate behavior, trip-switch isolation, same-trip serialization, cross-trip parallelism, failure recovery, deep nested snapshot isolation at the debounced queue boundary, old acknowledgement rejection, offline restart and reconnect, full-sync coalescing and cleanup, edit-during-sync preservation, account isolation, owner adoption, and stale read/stream rejection after deletion.

### Offline and restart behavior

**PASS (isolated simulation):** an offline cloud failure leaves the latest trip in `localStorage` with `syncStatus: failed`. A fresh JavaScript runtime reconstructs work by scanning persisted `pending`/`failed` trips on the `online` event. The test observes one upload, verifies that the state is only `pending` before the delayed server acknowledgement, and verifies `synced` only after that acknowledgement.

The retry queue itself is not persisted as executable queue data; it is reconstructed from the persisted trip sync status. A request that never settles still has no explicit write timeout and can block later saves for that one trip until the page is reloaded. This is a remaining reliability limitation, not a reproduced normal rejection path.

### Multi-device conflict classification

| Scenario | Classification | Evidence |
|---|---|---|
| Older response from this client completes after a newer local edit | PASS | timestamp comparison and deterministic delayed-acknowledgement test preserve the newer local revision |
| Device A and B edit unrelated fields from the same base | REPRODUCIBLE DATA-LOSS RISK | both clients upsert the whole payload; the later arrival replaces unrelated fields rather than merging |
| Client clocks are skewed | REPRODUCIBLE DATA-LOSS RISK | `updatedAt`/`cloudUpdatedAt` are client-derived; deterministic conflict simulation selects a chronologically older real-world edit when its clock is ahead |
| Equal timestamps | KNOWN LIMITATION | cloud wins on `>=`, and Realtime accepts equal timestamps, so a local pending edit can be displaced on a tie |
| Delete on Device A while Device B retains a local copy | REPRODUCIBLE DATA-LOSS RISK | there is no persistent server tombstone and Realtime listens only for `UPDATE`; B can upload its retained copy during a later sync |
| Full authenticated two-device session | NOT TESTED | no isolated pair of authenticated device fixtures was available |

These multi-device risks require a server-enforced revision/conditional update and persistent deletion semantics. They were documented rather than hidden behind a broader client-only rewrite.

### Live Supabase authorization evidence

- **PASS:** the configured and live project reference is `hyaebqvwvdnbmvijnjcf`; the project was healthy and all seven repository migrations were present in live history.
- **PASS:** RLS is enabled live on `travel_trips`, `travel_documents`, `trip_members`, `trip_messages`, `trip_invites`, `travel_ai_usage`, and `storage.objects`.
- **PASS:** the anonymous role lacks table access; a read attempt was denied with PostgreSQL `42501`.
- **PASS:** an authenticated synthetic non-member UUID returned no rows from trips, documents, memberships, or messages. The inspection was read-only and did not alter production data.
- **PASS (schema/policy):** document metadata is owner-private, the Storage bucket is private, and object policy binds the first path segment to `auth.uid()`. Documents do not inherit shared-trip membership. AI notes stored in `travel_trips.payload` inherit the trip row's RLS.
- **NOT TESTED:** live owner/editor/viewer mutation matrix and MFA flows, because no isolated authenticated role sessions were available.
- **KNOWN ARCHITECTURE RISK:** `main` and `preview` reference the same Supabase backend.
- **HARDENING GAPS:** redundant legacy owner-only policies remain beside collaboration policies; authenticated table grants include `TRUNCATE`; anonymous `EXECUTE` grants remain on two security-definer helpers; leaked-password protection is disabled; and `supabase/security_audit.sql` names `trip_invitations` although the actual table is `trip_invites`.

### Israel regression trip

**BLOCKED:** there is no tracked Israel entry page, seed, migration, fixture, or Git-history artifact. A user-created Israel trip would use the normal custom-trip identity (`String(Date.now())`), active storage key `travelmate-trips`, account snapshot `travelmate-trips-user:<user-id>`, cloud identity `<owner-id>:<trip-id>`, and `trip/custom/index.html?id=<trip-id>`. It therefore appears to be private local/cloud user data. No browser storage or account data was read or changed, and the Italy trip source was not modified.

### Performance impact

- No polling, observer, AI request, or UI render path was added. One page-lifetime `online` listener reconstructs retry work.
- Same-trip writes are serialized; different trips and full-sync saves run in parallel. Queue and per-user full-sync map entries are removed after success or failure in the deterministic tests.
- The deep clone is limited to the trip snapshot boundary and correctly isolates nested JSON-compatible arrays and objects.
- `queueTripSave()` still deep-clones and rewrites the complete local trip list before its 650 ms network debounce. Day-note input already writes the list and then queues another local write, so large trips can incur repeated synchronous serialization while typing. Classification: **MEDIUM performance risk**.
- A never-settling Supabase write has no explicit timeout and can retain one trip's save chain. `deletedTripIds` retains one in-memory ID per successful page-lifetime deletion. Both are bounded to the current page but remain follow-up items.

### Phase readiness

Phase 0 response/save identity and single-device local persistence now have high local confidence. Live RLS has medium-high confidence from deployed definitions plus anonymous/non-member evidence. Phase 1 is **not complete for multi-device editing**: unconditional whole-payload upserts, client-clock arbitration, and the absence of persistent deletion tombstones remain reproducible data-loss risks. Phase 2 should not begin until the product either implements server-enforced revision/deletion semantics or explicitly accepts and scopes those limitations, and until the owner/editor/viewer authorization matrix is exercised with isolated authenticated fixtures.

## Phase 1.6 concurrency and deletion design

Phase 1.6 remains local and uncommitted on the same baseline. It introduces no UI, service-worker, asset-version, AI, document, or design change.

### Verified cloud write contract before Phase 1.6

Feature modules mutate the canonical trip object, usually write the full `travelmate-trips` array, and then call `queueTripSave()` or `saveTrip()`. `cloud-sync.js` deep-clones a snapshot, records a client-generated `updatedAt`, marks it pending, serializes same-trip requests, and writes the complete row/payload through PostgREST `upsert` or `update`. The database primary key is `(user_id, id)`; `user_id` is the owner. `updated_by` records the actor. Hydration compares client-derived `updatedAt`/`cloudUpdatedAt`, and Realtime listens for trip `UPDATE` events. Hard deletion removes the server row and cascades membership/message records. No existing revision column, conditional-write RPC, deletion record, or CAS function was found.

Write entry points include home trip creation/date/activity changes, Navo note saves, Places/scheduling changes, lodging, plan/day-note changes, place autofill, and trip-experience data. They converge on `TravelMateCloud.saveTrip()` or `queueTripSave()`.

### Selected concurrency strategy

The local migration `20260913190000_trip_revision_and_tombstones.sql` adds four fields to `travel_trips`: server-owned integer `revision`, nullable `deleted_at`, `last_mutation_id`, and `last_mutation_by`. The `save_travel_trip` RPC locks the row with `FOR UPDATE`, checks the caller's expected revision, advances the revision and server timestamp atomically, and returns a detectable `saved`, `conflict`, or `deleted` result. The mutation UUID makes a retry after an ambiguous network failure idempotent. `delete_travel_trip` applies the same expected-revision and mutation-ID contract while recording a persistent soft-delete tombstone.

This was selected over client timestamps because wall clocks cannot prove ordering, and over automatic field merging because the payload has no stable per-field revision model. A separate event log, CRDT, new storage service, and field-level merge were rejected as disproportionate. A separate tombstone table was unnecessary because retaining the existing row preserves its primary identity and revision with fewer queries and no join during writes.

The client persists `cloudRevision` after acknowledgement and retains `syncMutationId` across failed/timeout retries. A conflict is recorded as `syncStatus: conflict` and is not silently retried. A bounded 15-second write wait releases the per-trip queue; an aborted or otherwise ambiguous request keeps the same mutation UUID for retry.

### Compatibility and rollout boundary

Existing database rows receive revision 1 and remain readable. A previously hydrated local trip without `cloudRevision` can make one safe transition using an exact match against its existing `cloudUpdatedAt`; subsequent acknowledgements carry the server revision. A new frontend can temporarily fall back to the old PostgREST write only when the RPC is absent, allowing the frontend to be published before the migration.

After the migration, direct authenticated insert/update/delete privileges on `travel_trips` are revoked. Older clients therefore fail their cloud mutation safely instead of bypassing concurrency. This is data-safe but not seamless: they retain local failed state and cannot cloud-save until refreshed to the new frontend. Because `preview` and `main` share one backend, the migration must not be applied until compatible frontend code and cache-busted assets are approved for both branches. The migration cannot be safely rolled out to preview alone.

Rollback would require restoring direct DML grants, which also restores the lost-update risk. Columns and tombstone rows should not be dropped during rollback; soft-deleted rows must be reconciled before any return to hard deletion.

### Persistent deletion behavior

Successful deletion now leaves the server row with `deleted_at` and an incremented revision. Normal RLS reads exclude deleted rows. The delete RPC is owner-only and explicitly checks the existing MFA rule. A stale client save receives `deleted`, and full sync removes the obsolete local copy instead of recreating it. Local deletion intent and its mutation UUID survive a timeout/restart as `deletePending`, allowing the online retry path to complete the same logical deletion. Archive state remains ordinary trip payload and is not treated as deletion. Tombstone retention and eventual administrative cleanup remain a later operational policy; removing tombstones too early would reopen resurrection risk.

### Deterministic concurrency results

| Scenario | Result | Evidence |
|---|---|---|
| Same-field concurrent edit from revision 10 | PASS | first writer advances to 11; stale second writer receives conflict and cannot replace it |
| Unrelated-field concurrent edit | PASS for loss prevention; KNOWN LIMITATION for merge | stale second payload conflicts; no automatic field merge is attempted |
| Offline device reconnects with revision N after server reaches N+1 | PASS | stale expected revision is rejected |
| Ambiguous acknowledgement and retry | PASS | identical mutation UUID returns the existing successful revision without another increment |
| Stale save after server deletion | PASS | persistent tombstone returns `deleted`; local copy is removed during sync |
| Existing row/local payload without revision | PASS in simulation/static contract | exact legacy server timestamp allows one migration write |
| Real PostgreSQL execution | BLOCKED | neither Supabase CLI nor `psql` is installed locally; migration was not applied anywhere |

### Authorization matrix

| Operation | Policy/RPC result | Live authenticated execution |
|---|---|---|
| Owner reads/edits/deletes trip | Allowed; save/delete RPCs validate owner/member role and MFA | NOT TESTED with isolated owner session |
| Editor reads and edits trip content | Read via membership; save RPC requires `can_edit_trip` | NOT TESTED with isolated editor session |
| Editor attempts delete/owner-only action | Delete RPC requires `auth.uid() = owner`; member policy remains owner-managed | NOT TESTED; static denial verified |
| Viewer reads trip | Allowed through membership read policy | NOT TESTED with isolated viewer session |
| Viewer mutates trip | Denied by `can_edit_trip`; direct DML is revoked | NOT TESTED; static denial verified |
| Non-member reads/mutates | Live synthetic non-member read returned zero rows; RPC edit check denies mutation | Read PASS; mutation NOT TESTED live |
| Owner changes/revokes member role | Existing owner-only membership policy | NOT TESTED live |
| Revoked member access | Membership-dependent read/edit becomes false | NOT TESTED live |
| Documents | Owner-private metadata and Storage path; collaborators do not inherit access | Policy PASS; authenticated E2E NOT TESTED |
| AI notes | Stored in trip payload and inherit trip read/edit rules | Policy PASS; authenticated E2E NOT TESTED |
| Tombstone visibility | Hidden from normal member reads; RPC can detect it under explicit authorization | Static migration validation only |

### Performance and application weight

A 144,656-byte synthetic trip with 360 activities, 150 places, 30 day notes, and 25 AI notes measured about 0.403 ms per deep clone in Node on this workstation. Average stringify/parse measurements were 0.337/0.170 ms for one trip, 2.014/1.623 ms for ten trips (1.45 MB), and 4.325/4.004 ms for 25 trips (3.62 MB). These are deterministic desktop measurements, not Android frame metrics.

`queueTripSave()` still snapshots and rewrites local state for every call before the network debounce. A 20-event note-edit burst therefore produces 20 queue-side local writes and clones; the auto-planner caller also performs 20 full-list writes, while the debounce normally produces one network mutation. The measured cost is material for multi-megabyte collections, but removing the immediate queue-side persistence would break callers that rely on it. No speculative storage rewrite was made.

Phase 1.6 adds approximately 5.7 KiB to production `cloud-sync.js` relative to the Phase 1.5 working copy and a 9.2 KiB migration. It adds four persistent columns, two RPCs, no dependencies, no frameworks, no polling, no observers, no listeners, and no extra steady-state network request. One timeout timer exists only while each write is active and is cleared on settlement. Same-trip queues remain serialized and clean up after timeout/failure; different trips remain independent.

### Migration and deployment status

The migration exists locally and passed static contract assertions, but it was not executed locally or remotely. SQL runtime validation is **BLOCKED** by the absence of a local PostgreSQL/Supabase CLI environment. No remote migration, function deployment, secret change, or data mutation occurred.

A future push to `preview` would always trigger the GitHub Pages workflow. The `supabase/migrations/**` path does not trigger any database migration workflow. The Supabase workflow triggers only for function/config/workflow changes, and Phase 1.6 changes none of those paths. Consequently, pushing the current files would deploy frontend code without applying the migration; the compatibility fallback would keep old persistence behavior and concurrency would remain unenforced. The shared backend migration must be a separate explicitly approved operation after compatible, cache-busted clients are ready on both `preview` and `main`.

### Later security backlog

The following are recorded separately and were not mixed into Phase 1.6: remove excessive authenticated `TRUNCATE` grants; revoke unnecessary execution access on `add_trip_owner_member()` and `is_app_admin()`; enable leaked-password protection; and correct `supabase/security_audit.sql` from `trip_invitations` to `trip_invites`. None was changed locally or remotely in this phase.

### Phase 1.6 readiness

The client/RPC contract and deterministic tests are ready for controlled database review, but deployment is not yet ready. Blockers are a real PostgreSQL migration test, an approved two-branch rollout sequence for the shared backend, cache/version preparation for both clients, and authenticated owner/editor/viewer verification against an isolated synthetic fixture after migration.

## Phase 1.7 database proof and rollout-readiness audit

Phase 1.7 was performed locally on `preview` at `59c042dfc7fdb03696e351f30beaaf16c9bbd77c`. No commit, push, deployment, remote migration, live RLS change, secret change, or real-user-data mutation occurred. Docker/Docker Desktop, Supabase CLI, `psql`, and a local PostgreSQL server were unavailable. `npx` and Node 24.19.0 were present, but an npm-invoked Supabase CLI would still require Docker for a local stack. Therefore the migration was not executed and every database-runtime claim remains **BLOCKED** or **NOT TESTED** rather than being inferred from SQL.

### Complete `travel_trips` write-path inventory

All current application trip mutations converge on `assets/cloud-sync.js`. `assets/home.js` calls immediate saves/deletes for trip creation, dates, activation and deletion. `assets/ai-assistant.js`, `assets/auto-planner.js`, `assets/app.js`, `assets/place-auto-fill.js`, `assets/lodging-manager.js`, and `assets/trip-experience.js` update the local payload and call `queueTripSave()` or `saveTrip()`. Full synchronization and `getTrip()` reconciliation can also call `saveTrip()`/`deleteTrip()`. Realtime handlers accept remote rows but do not mutate `travel_trips`. Documents and AI notes only cause an indirect trip save through those same public cloud helpers.

The only direct PostgREST mutations in current source are the deliberately temporary compatibility fallbacks in `performTripSave()` and `deleteTrip()`. After migration they must be unreachable because RPCs exist; direct DML grants are revoked. A historical deployed client at commit `594c17e` uses direct `upsert`/`update`/`delete`. A deterministic historical-client test proves a `42501` rejection is surfaced and its local edit remains present; it does not interpret the failure as success or delete the local trip. It has no autonomous retry loop, so it does not continuously hammer the backend, but its UI has no durable `failed` marker and the user must load a compatible client to retry/reconcile. The local repository has no `main` ref and the configured Git remote helper was unavailable, so current `main` could not be inspected independently. Minimum shared-backend prerequisite: the compatible RPC-first client must be cache-busted and deployed on both `preview` and `main` before direct DML is revoked.

### Correctness defects found and corrected

1. **RPC fallback classification:** the previous predicate accepted every `PGRST202`, even when its diagnostic named another function. It now requires code `PGRST202`, the exact requested RPC name, and PostgREST's “Could not find the function … in the schema cache” diagnostic. Permission/RLS/MFA, malformed arguments, conflicts/deleted responses, network errors, timeout, 5xx, unknown errors, and unrelated `PGRST202` never enter the direct-write fallback. Regression tests cover both the genuine missing-function case and all denied cases.
2. **Timeout truthfulness:** a client timeout previously persisted `failed`, falsely implying rejection. It now persists `unknown`, retains the mutation UUID, releases the same-trip queue, and includes `unknown` in reconnect retry discovery. The timeout occurs outside RPC result classification, so it cannot activate legacy fallback. A retry with the same UUID safely observes a prior success when it remains the row's latest mutation.
3. **Tombstone discovery without a write:** normal RLS intentionally hides deleted rows, so the earlier full-sync claim depended on attempting a stale save. The migration now adds `list_travel_trip_tombstones()`, a read-only, authenticated, MFA-compatible `SECURITY DEFINER` RPC returning only owner ID, trip ID, revision and deletion time for trips where the caller is still a member. Full sync requests this metadata, removes stale local copies before reconciliation, and does not attempt a save. This adds one RPC per full sync, no polling and no per-edit request.
4. **Idempotency boundary:** `last_mutation_id` guarantees only an immediate retry while that mutation remains the most recent row mutation. If mutation A succeeds, mutation B then advances the row, and A retries, A receives a revision conflict; it does not receive false success, recreate A's payload, decrement the revision or overwrite B. This exact intervening-write case is covered.

### Security-definer and MFA review

`save_travel_trip` requires an authenticated `auth.uid()`, a non-null mutation ID and payload, owner identity for creation, and `can_edit_trip()` for updates. `delete_travel_trip` requires the caller to be the owner. Both lock the target row before comparing the expected revision/timestamp. The tombstone listing RPC exposes only deletion metadata and explicitly checks membership. All three revoke execution from `public` and `anon` and grant only `authenticated`. Direct authenticated DML is revoked. `SECURITY DEFINER` is necessary because the write RPCs must atomically lock/update rows after direct DML is revoked and because deleted rows are hidden by normal RLS. Each function now uses an empty `search_path` and schema-qualifies application objects/functions, reducing caller-controlled object-resolution risk.

The RPCs preserve the existing `mfa_satisfied_if_enrolled()` semantics. Ordinary authenticated users with no verified factor may continue at AAL1. Users who enrolled a verified factor require an AAL2 JWT. Saving and deleting therefore do not introduce universal mandatory MFA; they mirror the restrictive policy already applied to personal trip data. This is static proof only: authenticated owner/editor/viewer/MFA execution remains unavailable.

### Concurrency, timestamps, deletion, and Realtime evidence

Unit/contract simulation passes for same-field collision, unrelated-field collision, stale offline writer, monotonic revision, simple ambiguous retry, intervening-write retry, stale save after tombstone, restart of pending deletion with the same UUID, archive/deletion separation, and legacy transition. `FOR UPDATE` and expected-revision comparison are present in SQL, but row-lock behavior and true concurrent transactions were not executed.

The client sends a hydrated `updated_at` string back as `p_expected_updated_at` without `Date` parsing or ISO reserialization. A contract test preserves a PostgreSQL-style six-digit microsecond value exactly. PostgreSQL compares `timestamptz` instants, so equivalent timezone offsets should compare equal after server parsing; actual PostgREST round-trip precision remains **NOT TESTED** without PostgreSQL. Revision becomes the authority after the first successful transition.

Explicit stale save returns `deleted`, and full sync now discovers tombstones without a write. Pending deletion survives restart with the same mutation ID. Archive remains a normal payload value and never maps to `deleted_at`. Realtime deletion delivery is **NOT PROVEN**: an UPDATE that changes `deleted_at` may cease to satisfy the row's SELECT policy and may not be delivered to subscribers. Correctness no longer depends on that event; full sync/reconnect is the durable recovery path. Immediate connected-device removal remains a runtime validation item rather than a claimed guarantee.

Tombstones must remain long enough to outlive every offline client that may still hold the trip. Hard deletion without a separate durable deletion generation/ledger would allow a very stale owner client to treat the absent row as a new create. No cleanup was implemented. Any future retention policy must retain a non-reusable identity/generation marker beyond the maximum offline window.

### Authorization and database execution status

Static expected matrix: owner read/edit/delete allowed; editor read/edit allowed and delete denied; viewer read allowed and mutation denied; non-member read/mutation denied; revoked member loses membership-dependent read/edit; tombstone metadata is visible only to authenticated current members through the dedicated RPC. Documents remain owner-private, while AI notes remain inside the trip payload. Real authenticated execution for every role, tombstone visibility, PostgREST RPC schema exposure, RLS, grants and MFA is **BLOCKED** by the missing isolated stack.

No real migration execution, synthetic pre-migration row upgrade, function compilation, index inspection, concurrent PostgreSQL transaction, authorization matrix, or Realtime delivery test was possible. Static parsing and JavaScript contract tests are explicitly not presented as database proof.

### Performance and operational impact

The Phase 1.7 client change adds one small tombstone metadata RPC to each full synchronization. It adds no dependency, observer, listener, polling loop, per-save request, UI render or storage framework. The existing full-list clone/stringify/localStorage cost is unchanged and remains a later Android performance concern. Existing desktop Node measurements remain evidence only for desktop JavaScript, not an Android pass.

Committing the migration to `preview` would trigger GitHub Pages because that workflow runs on every preview push, but Pages excludes `supabase/` from its artifact. It would not apply a database migration. The Supabase workflow triggers only for `supabase/functions/**`, `supabase/config.toml`, or its workflow file and deploys only the Edge Function; this migration changes none of those paths. There is no repository workflow that applies database migrations.

### Future rollout sequence and rollback

1. Execute the migration against a disposable Supabase-compatible stack; verify schema, functions, grants, RLS, exact PostgREST signatures, timestamp transition, locking, concurrency, role/MFA matrix and Realtime behavior with synthetic identities.
2. Publish the RPC-first, exact-fallback, tombstone-aware frontend with a new service-worker/cache and asset version to `preview` while the RPCs are absent; genuine missing-RPC fallback preserves legacy writes.
3. Put the same compatibility client and cache bust on `main`, then account for cached older clients. Do not enforce the migration until both branches serve compatible code and the intended refresh/update window has passed.
4. Apply the shared-backend migration once. Immediately validate owner/editor/viewer/non-member/MFA operations and observe conflicts/tombstones with synthetic accounts.
5. Roll back operationally by restoring direct DML grants only if emergency old-client compatibility is required, accepting that this reopens lost-update/resurrection risk. Do not drop RPCs, revision/deletion columns, mutation IDs or tombstone rows once any compatible client depends on them. Schema/data rollback would destroy concurrency/deletion evidence and is unsafe.

### Phase 1.7 readiness decision

**NOT READY FOR BACKEND ROLLOUT APPROVAL.** Exact blockers are: no executed migration on PostgreSQL/Supabase; no real row-lock/concurrency proof; no authenticated owner/editor/viewer/revoked-member/MFA matrix; no verified PostgREST signatures/timestamp round trip; uncertain Realtime tombstone delivery; and no independently verified compatible `main` client on the shared backend. The local implementation is better specified and its 45 deterministic tests pass, but those tests do not replace database execution evidence.

## Phase 1.8 real Supabase database validation

All remote mutations in this phase targeted only the isolated project `nimezwserwvrsbyogjox` (`travelmate-phase1-test`, `eu-central-1`). The project was `ACTIVE_HEALTHY` on PostgreSQL 17.6 (`17.6.1.166`) and initially contained no application migrations or public TravelMate tables. The production ref `hyaebqvwvdnbmvijnjcf` was used only for a final read-only migration-history safety check; it received no SQL, migration, RLS/Auth/configuration change, function deployment, synthetic identity, or test row.

### Schema preparation and executed migrations

The minimum repository-defined chain was applied in order: `cloud_synced_trips`, `collaborative_trips`, `mfa_personal_data`, and `trip_revision_and_tombstones`. AI usage, documents/storage, admin and repair migrations were excluded because they are not dependencies of the trip concurrency contract. Two small corrective migrations were then applied to the isolated database after runtime evidence exposed inherited privilege issues: `restrict_travel_trip_direct_privileges` and `restrict_trip_trigger_helper_execution`.

Database inspection proved `travel_trips` has RLS enabled, revision `bigint NOT NULL DEFAULT 1`, nullable `deleted_at`, `last_mutation_id` and `last_mutation_by`, its composite primary key, and the partial visible-row index. All three Phase 1 RPCs compiled with the expected signatures, are `SECURITY DEFINER`, use an empty `search_path`, deny anon execution, and grant authenticated execution. The authenticated table grant is now SELECT only.

### Runtime defect and correction

The original migration revoked INSERT/UPDATE/DELETE but inherited authenticated `TRUNCATE`, `TRIGGER`, and `REFERENCES` grants from the base schema. `TRUNCATE` bypasses row-level DML policy and was a blocking destructive capability. The repository migration now executes `REVOKE ALL ON travel_trips FROM authenticated` followed by `GRANT SELECT`; the isolated database confirms SELECT is the only remaining table privilege. A direct authenticated UPDATE returns PostgreSQL `42501`.

The Supabase advisor also found the trigger-only `add_trip_owner_member()` callable by anon/authenticated as a public `SECURITY DEFINER` RPC. It does not need client execution. The migration now revokes it from public, anon and authenticated; the advisor no longer reports anonymous security-definer execution and direct privilege inspection confirms denial.

### Real RPC, authorization and MFA results

Five deterministic synthetic identities were created only in the isolated project: owner, editor, viewer, non-member and revoked-member. Four synthetic trips were used; no real destination/private data was copied.

Owner read, create, update and delete passed. Editor read/update passed and owner-only delete returned `42501`. Viewer read passed; save/delete returned `42501`. Non-member read returned zero rows and mutation/delete returned `42501`. A revoked member could read before membership removal and returned zero rows afterward. Owner spoofing by an editor on creation returned `42501`.

An AAL1 identity without a verified factor saved successfully. After adding a synthetic verified factor to the owner, AAL1 reads were hidden and save returned `MFA required`; the same operation with an AAL2 claim succeeded. This proves the migration preserves the existing “AAL2 only when enrolled” behavior rather than introducing universal MFA.

### Real concurrency and idempotency results

Two genuinely concurrent connector requests submitted the same expected revision 1 to the same row. Exactly one returned `saved` revision 2 and the other returned `conflict` revision 2. The final row contained the successful payload and one mutation ID. This is runtime proof that row locking and the post-lock revision check prevent both writers from validating the same revision.

For unrelated-field and stale-offline scenarios, a writer advanced revision 2 to 3 and a second payload using revision 2 received conflict without replacing the first payload. Sequential saves advanced revisions monotonically. Parallel requests to two separate trip rows both succeeded and each advanced independently from 1 to 2; connector wall time includes MCP/network scheduling and is not proof of server parallel throughput.

An immediate retry of the accepted mutation returned `saved` at the existing revision 3 without another increment. After a different mutation advanced the row to revision 4, retrying the older mutation returned conflict and left revision 4 and the newer payload intact. The exact guarantee therefore covers only the latest mutation ID, not unlimited historical retries.

### Legacy timestamps, tombstones and Realtime

A synthetic legacy row stored `2026-09-13 15:34:56.123456+00`. Passing the equivalent offset form `2026-09-13T17:34:56.123456+02:00` to the RPC succeeded and advanced revision 1 to 2, proving PostgreSQL instant equality across offsets with microseconds. The local contract separately proves that the JavaScript client forwards the hydrated string without normalization. A full authenticated Supabase JS/PostgREST round trip was not available.

Owner deletion advanced revision 3 to 4 and set `deleted_at`. Repeating the same delete mutation returned revision 4 without another increment. A stale save returned `deleted` and did not resurrect data. Normal RLS reads returned no row. Owner, editor and viewer each received one minimal tombstone record; non-member and revoked-member received none. The RPC exposes only owner ID, trip ID, revision and deletion time. Client contract tests prove full sync removes a stale local trip from this metadata without calling save; restart preserves the delete mutation UUID. A trip with `archived: true` retained `deleted_at = NULL`.

Realtime tombstone delivery remains **NOT TESTED** because no authenticated WebSocket session was available. Correctness does not rely on that event; tombstone full sync/reconnect remains the durable path.

### Timeout, fallback, old client and performance

Client timeout/unknown semantics remain covered locally: timeout releases the queue, preserves the mutation UUID, never triggers direct fallback and retries safely. Controlled transport interruption was not available through the database connector, so ambiguous network acknowledgement was validated by real idempotency calls plus deterministic client tests rather than a dropped HTTP response.

A direct PostgREST missing-RPC probe through the restricted shell failed to return a usable response after two attempts and was stopped. The exact `PGRST202` HTTP signature remains contract-tested but not observed here. Permission, MFA and direct-write failures were observed as PostgreSQL `42501` and cannot satisfy the narrow fallback classifier.

The historical direct-write behavior was validated against the isolated post-migration database: direct writes are denied. The existing deterministic historical-client test proves the client retains its local edit and does not report success or start an aggressive retry loop. This still does not prove current `main` compatibility.

Observed end-to-end connector wall times were roughly 3.6–5.3 seconds per individual RPC and 4.7 seconds for delete; these figures include MCP and management-API overhead and are not application/PostgREST latency measurements. The payloads were small synthetic JSON records. The implementation adds no per-save request beyond replacing PostgREST with one RPC, no polling, dependency, framework, observer or listener. Tombstone listing adds one request per full synchronization.

### Supabase advisor results

**Blocking issue fixed:** inherited authenticated TRUNCATE and public execution of the trigger helper.

**Important later:** advisor warns that signed-in users can execute intended application RPCs and helper functions; the three trip RPCs are intentionally authenticated and enforce identity/role internally. `can_edit_trip`, `is_trip_member`, `mfa_satisfied_if_enrolled`, and invite RPC exposure should receive a separate least-privilege review. Leaked-password protection is disabled. `trip_invites` has RLS with no policy, but the table is also revoked from anon/authenticated in the collaboration migration; this is fail-closed.

**Informational/performance:** unindexed foreign keys include `travel_trips.updated_by`, `travel_trips.last_mutation_by`, invite creator/composite trip key, and message sender. Two indexes are reported unused in this fresh test database, which is expected before representative workload. No unrelated advisor recommendation was applied.

### Production safety, fixtures and readiness

The isolated project retains the five `phase18-*@example.invalid` users, the synthetic MFA factor, memberships and synthetic `phase18-*` rows as a reproducible test fixture. Cleanup, if later requested, must target only `nimezwserwvrsbyogjox` and remove dependent memberships/trips/factor before users. No cleanup was performed automatically.

Phase 1.8 closes the migration compilation, schema, real locking/concurrency, core role matrix, AAL1/AAL2, deletion/idempotency and tombstone-visibility blockers. Remaining rollout blockers are current `main` compatibility, cached-old-client planning, a real PostgREST missing-RPC response capture, authenticated browser/full-sync integration, and Realtime deletion behavior. Production rollout must still follow compatibility frontend releases on both branches before shared-backend enforcement.

## Phase 1.9 frontend compatibility and rollout gate

Phase 1.9 was performed on `preview` at `59c042dfc7fdb03696e351f30beaaf16c9bbd77c`, matching `origin/preview`, with an empty index. The deployed baseline remains `travelmate-smart-v135` with asset version `20260913-2`. No checkout, merge, commit, push, deployment, production SQL, production Auth mutation, or production configuration change occurred. Existing unrelated edits and private test artifacts were preserved.

### Current `main` compatibility

Remote `main` was fetched read-only as `63191ba733423f126c03182eca70fd64989d52d9` and inspected through `FETCH_HEAD` without checking it out. Its `assets/cloud-sync.js` loads trips directly from `travel_trips`, saves with direct PostgREST `upsert`/`update`, and deletes with direct table DML. It has no `save_travel_trip`, `delete_travel_trip`, expected revision, mutation UUID, conflict/deleted response handling, bounded-write unknown state, or tombstone listing. Its account switching, hydration, local persistence and Realtime paths predate the Phase 1 guards. Its service worker is `travelmate-smart-v34`, precaches unversioned executable assets, uses `ignoreSearch: true` fallbacks, and deletes every origin cache except its own.

Compatibility matrix:

| Path | Current `main` classification | Result after direct DML revoke |
| --- | --- | --- |
| Trip save | Compatible only before migration | Direct write returns `42501`; cloud save fails |
| Trip delete | Compatible only before migration | Direct delete returns `42501`; cloud deletion fails |
| Account switching | Compatible only with the legacy data path | No RPC-era late-response/revision guarantees |
| Hydration | Compatible only with legacy rows | No revision/tombstone reconciliation |
| Realtime | Compatible only with visible rows | Cannot make tombstone correctness durable |
| Offline recovery | Compatible only before migration | Retains local edit, but has no durable failed/unknown marker or RPC retry contract |
| Local persistence | Partially safe | Failed direct write does not delete the local trip, but cloud acknowledgement is not represented safely |
| Service worker/cache | Incompatible rollout mechanism | Can mix query versions and can delete unrelated origin caches |

Therefore current `main` is **INCOMPATIBLE AFTER DIRECT-DML REVOKE**. The minimum compatibility release is the Phase 1 `assets/cloud-sync.js` contract already present in the preview working tree plus coherent service-worker/asset versioning: RPC-first save/delete, exact missing-RPC fallback, expected revision, stable mutation UUID, conflict/deleted/timeout state, account guards, and tombstone reconciliation. No duplicate compatibility implementation was added in Phase 1.9.

### Browser integration evidence and blocker

The current app loaded successfully from a local HTTP preview in the in-app Chromium browser, proving the local entry page and normal static asset graph were browser-loadable. The repository's normal configuration correctly points at production, so no authenticated action was attempted through that page. A dedicated authenticated test required a synthetic Auth session for the isolated project. The Phase 1.8 SQL identities were intentionally database fixtures without usable browser credentials. Two password-token attempts failed with `invalid_credentials`. A safer attempt to repair those synthetic Auth records was rejected by the execution approval system because changing Supabase Auth system fields could have broad authentication impact. No workaround was attempted.

Consequently create/save, reload/hydration, offline/reconnect, account switching, frontend conflict state, and delete/full-sync were **BLOCKED in a real browser**. Their client behavior remains covered by deterministic tests and their backend behavior by the Phase 1.8 authenticated SQL/JWT-role execution, but those evidence levels are not combined or presented as browser proof. A future browser pass needs test identities created through a supported isolated-project Auth admin path or an explicitly approved disposable browser-test account lifecycle.

### Real missing-RPC signature and fallback safety

A deliberately nonexistent function was called through the isolated project's PostgREST endpoint. The observed response was HTTP `404`, code `PGRST202`, `hint: null`, message `Could not find the function public.phase19_missing_rpc_probe without parameters in the schema cache`, and details stating that PostgREST searched for that exact function without parameters or with a single unnamed JSON/JSONB parameter and found no schema-cache match.

This matches the client's narrow classifier: code must equal `PGRST202`, the diagnostic must name the requested RPC, and it must contain the missing-function/schema-cache language. The 45-test suite confirms no fallback for `42501`, RLS/MFA denial, malformed arguments, network failure, timeout, 5xx, conflict, deleted, or unrelated `PGRST202`. No classifier patch was required.

The current RPC-first frontend is therefore source- and contract-compatible before migration: a genuine absent RPC enters the legacy PostgREST write path, while every other failure remains a failure. A real pre-migration authenticated end-to-end save/delete was not available because the isolated project already has the migration and no second pre-migration test backend was provisioned. This remains a rollout gate rather than an inferred runtime pass.

### Realtime tombstones

`public.travel_trips` is present in the isolated project's `supabase_realtime` publication and uses the default replica identity. An authenticated WebSocket observation could not be established without a supported browser Auth session, so delivery is classified **BLOCKED**, not delivered or filtered. RLS hides a row once `deleted_at` is set, so an UPDATE tombstone may be filtered from a subscriber when the new row no longer satisfies SELECT. Durable correctness remains the authenticated `list_travel_trip_tombstones()` call during full sync/reconnect, which passed real role-visibility tests and local client reconciliation tests.

### Cache and old-client behavior

Preview's v135 worker precaches executable/style assets under one exact query version, uses exact-request cache lookup for CSS/JS, retains network-first navigation, scopes cleanup to `travelmate-smart-vN`, and does not use cross-version `ignoreSearch`. Online navigation therefore obtains a coherent new HTML/asset graph; offline navigation uses one installed cache graph. `skipWaiting()` and `clients.claim()` activate the worker promptly but cannot replace JavaScript already executing in an open tab.

An old open `main` tab can therefore keep running v34 code after a compatible release. If backend enforcement occurs during that window, its direct write is rejected with `42501`; deterministic historical-client coverage shows the local edit remains and no aggressive autonomous retry loop begins, but that client cannot sync until compatible code loads. A reopened online PWA should receive network-first HTML, while an offline reopened PWA remains on its installed old graph. No cache policy can safely upgrade an already executing offline tab. The rollout must keep legacy direct grants available until both branches serve compatible, version-bumped entry pages and an operational client-update window has elapsed.

### Required rollout sequence

1. **Preview compatibility release.** Prerequisite: all local tests and clean scoped release review. Publish the RPC-first client plus a new service-worker and asset version while production is still pre-migration. Expected result: preview falls back only on the exact missing RPC. Failure: any save/delete, cache-coherence or account-isolation regression. Roll back by deploying the prior frontend; production data risk is low because backend enforcement has not changed.
2. **Pre-migration preview validation.** Prerequisite: supported synthetic preview account and production-safe test records. Exercise save, delete, reload, offline retry and account switching against the pre-migration backend. Failure: legacy fallback not observed or local data loss. Roll back frontend and stop; production-data risk is limited to explicitly synthetic rows.
3. **Prepare equivalent `main` client.** Prerequisite: reconcile preview's minimum `cloud-sync.js` contract onto current `main` without unrelated UI work. Expected result: both branches share the persistence contract. Failure: divergent write behavior or unresolved merge/test failures. No deployment; no production-data risk.
4. **Deploy compatible `main`.** Prerequisite: main regression pass and coherent new cache/asset version. Failure: workflow, asset, or authenticated smoke-test failure. Roll back to the previous frontend while direct grants still exist; production-data risk is low.
5. **Cache/client update window.** Prerequisite: both branch deployments verified byte-for-byte. Monitor adoption/error telemetry and allow active tabs/PWAs to reload; provide an in-app update prompt if available. Failure: substantial old-client traffic or direct-write errors. Extend the window; do not enforce the backend. No schema risk.
6. **Apply production migration once.** Prerequisite: explicit approval, current production backup/recovery posture, low old-client traffic, and passing browser integration. Expected result: RPCs/tombstones/revisions active and direct DML revoked. Failure: migration error or unexpected privilege/RLS result. Stop immediately. Production data risk is medium because write authority changes.
7. **Immediate authenticated smoke tests.** Verify owner/editor/viewer/non-member/MFA, save/conflict/delete/tombstone/full sync, both branches, and cache versions. Failure: restore direct DML grants temporarily while preserving the new schema and evidence. Production data risk is controlled but legacy lost-update/resurrection exposure returns during the grant rollback.
8. **Monitor.** Track conflicts, timeout/unknown states, sync failures, tombstone reconciliation and `42501` from old clients. Failure threshold: sustained sync failures, unexplained local/server divergence, or material old-client write rejection. Use the operational rollback below.

### Rollback strategy

Emergency rollback restores only the previous authenticated direct INSERT/UPDATE/DELETE grants required by the legacy client, after confirming the exact production role grants. Keep revision, deletion and mutation columns, RPCs, indexes, tombstones and mutation IDs. Do not drop or rewrite the schema after compatible clients have begun using it: doing so destroys concurrency generations and deletion evidence, can make idempotent retries ambiguous, and can resurrect stale offline data. Trigger rollback when authenticated smoke tests fail, conflict/deleted results are misclassified, tombstones cannot reconcile, or old-client `42501` volume remains operationally unacceptable. Remove temporary grants again only after the client population is demonstrably compatible.

### Performance and regression evidence

One save RPC replaces one direct write; it does not add a save request. Tombstone listing adds one request only to each coalesced full sync. There is no polling. The Phase 1 code adds no dependency, framework, MutationObserver, or duplicate listener. One `online` listener invokes retry only when local trips are pending/failed/unknown. One bounded timeout exists per active write and is cleared on settlement. Full sync remains coalesced per account, and save chains remain per trip. Existing full-payload serialization/localStorage cost is unchanged.

All 45 local tests passed: 25 data-integrity, 2 conflict-strategy and 18 concurrency-contract. Syntax checks passed for `assets/ai-assistant.js`, `assets/cloud-sync.js`, `assets/trip-intelligence.js`, and `sw.js`. `git diff --check`, the first-party HTML asset/reference check, and the scoped secret scan passed. Browser evidence is limited to unauthenticated local load; authenticated browser scenarios are blocked as described. Real Supabase evidence remains the Phase 1.8 migration, authorization, MFA, concurrency, idempotency, timestamp and tombstone suite plus the Phase 1.9 observed PostgREST signature.

### Phase 1.9 decision

**NOT COMPLETE.** The rollout is not ready because current `main` is incompatible, no compatible `main` release exists, no real authenticated browser integration has passed, Realtime tombstone delivery remains blocked, and pre-migration fallback has not been exercised end to end against an authenticated pre-migration environment. Production remains untouched and retains only its seven original migrations. The next controlled action is to obtain a supported synthetic browser Auth session in the isolated project, complete the browser matrix, then prepare and validate the minimal compatibility frontend for `main` before any production migration approval.

## Phase 1.9b supported Auth and minimum-main delta

Phase 1.9b remained narrowly limited to the supported authentication gate, the pending browser matrix, and a read-only refresh of the current-main compatibility delta. Repository state remained `preview` at `59c042dfc7fdb03696e351f30beaaf16c9bbd77c`, matching `origin/preview`, with an empty staging area. Remote `main` remained `63191ba733423f126c03182eca70fd64989d52d9` when fetched read-only through `FETCH_HEAD`.

### Supported isolated Auth result

The isolated project reports email authentication enabled, signup enabled, and `mailer_autoconfirm: false`. The supported public `signUp` endpoint was exercised with a clearly synthetic `.invalid` identity. Supabase rejected it as `email_address_invalid` before creating a user. Because email confirmation is required, continuing with another address would require access to a real inbox and would not produce an immediately usable automated session. No internal Auth table was inserted or updated in Phase 1.9b, and the prohibited direct-Auth-table method was not repeated.

The incomplete `phase18-*@example.invalid` rows were identified previously. They remain confined to `nimezwserwvrsbyogjox` and were left untouched because cleanup is unnecessary for continued database-contract testing. No broad Auth cleanup was performed.

The single minimal operator action needed to unblock the browser matrix is to disable **Confirm email** temporarily in the isolated project's Auth Email provider, thereby enabling auto-confirm for newly created synthetic test users. This setting must be changed only for `nimezwserwvrsbyogjox`, followed by creation of fresh users through `supabase.auth.signUp()`. An equally supported alternative is access to the official Admin Auth API for the isolated project, but internal `auth.users`/`auth.identities` manipulation is not acceptable.

### Authenticated browser matrix

No legitimate browser session could be established under the current confirmation policy, so the six required flows remain **BLOCKED**, not failed and not inferred from lower-level evidence:

| Flow | Phase 1.9b browser result | Existing lower-level evidence |
| --- | --- | --- |
| Save/acknowledgement | BLOCKED | RPC contract and real isolated owner save pass |
| Reload/hydration | BLOCKED | Deterministic hydration/revision tests pass |
| Offline/reconnect | BLOCKED | Deterministic retained-local-edit and reconnect tests pass |
| Account switch | BLOCKED | Deterministic late-response/storage-isolation tests pass |
| Conflict | BLOCKED | Real concurrent RPC conflict and deterministic client conflict-state tests pass |
| Delete/full sync | BLOCKED | Real tombstone visibility and deterministic full-sync removal tests pass |

The already captured real `PGRST202` missing-function response plus focused classifier tests remain the available pre-migration fallback evidence. The migrated isolated project was not rolled back, and no additional project was created. Authenticated pre-migration browser fallback remains **NOT TESTED**.

### Exact minimum compatibility patch for current `main`

The patch must be prepared later on a main-based worktree and must not import unrelated preview UI, Navo, styling, security-center, admin-center, or trip-intelligence changes.

1. **`assets/cloud-sync.js` — persistence contract only.** Add stable trip/owner identity helpers, active-account assertions, per-trip save chains, coalesced per-account full sync, deletion guards, bounded write timeout, mutation UUID creation/reuse, exact `PGRST202` RPC-missing classification, and explicit `pending`/`synced`/`failed`/`unknown`/`conflict` state transitions. Extend `toRow()`/`fromRow()` only for `revision`, `deleted_at`, mutation metadata and sync state. Replace the internals of `saveTrip()`/`queueTripSave()` with snapshot-before-debounce, `save_travel_trip` RPC-first execution, expected revision or exact legacy timestamp, and direct-write fallback only for the exact absent RPC. Add `deleteTrip()` using `delete_travel_trip` RPC-first behavior and persistent delete mutation identity. Update `getTrip()`, Realtime acceptance, account activation/sign-out guards, `syncLocalTrips()` and the one online retry hook so stale responses cannot cross accounts or resurrect deleted trips. Add `listCloudTripTombstones()` once per coalesced full sync. Preserve main's existing public API and collaboration/auth features; do not port preview-only MFA/UI helpers unless independently required by main.
2. **`sw.js` — cache coherence only.** Replace v34's unversioned CORE list and cross-version `ignoreSearch` fallback with one release-level `ASSET_VERSION`, exact query-versioned JS/CSS/JSON CORE URLs, exact-request runtime fallback, network-first navigation, and cleanup limited to obsolete `travelmate-smart-vN` caches. Preserve `skipWaiting()` and `clients.claim()`. Do not port unrelated asset additions from preview; build CORE from files that actually exist on main.
3. **Entry pages — version-only release graph.** Update the `cloud-sync.js` and other modified executable/style query versions coherently in exactly the four main entry pages that load it: `index.html`, `trip/custom/index.html`, `trip/italy-2028/index.html`, and `trip/japan-2027/index.html`. Use one new service-worker/cache version and one new asset version. Do not copy preview markup or design changes.
4. **Focused tests.** Port the cloud-sync integrity and concurrency contract cases needed to prove local retention, snapshotting, same-trip serialization, account switching, conflict/unknown state, deletion restart, tombstone reconciliation, exact missing-RPC fallback and historical-client denial. Tests and migration remain separate from the user-facing main bundle.

Main call sites in `assets/app.js`, `assets/auto-planner.js`, `assets/home.js`, and `assets/trip-experience.js` already converge on `TravelMateCloud.queueTripSave()`/`saveTrip()` and do not require feature rewrites. They need regression verification against the preserved public API, not wholesale replacement. The deletion call site must use the newly exposed `deleteTrip()` where current main performs direct deletion through its cloud helper.

### Performance and readiness

No Phase 1.9b code, dependency, framework, listener, timer, polling loop, storage layer or network request was added. The intended compatibility patch keeps one RPC per save/delete, one tombstone request per coalesced full sync, one conditional online retry listener, and the existing localStorage architecture. Full-list rewriting remains a later performance item and was not changed.

All 45 local tests passed again: 25 integrity, 2 conflict-strategy and 18 concurrency-contract. Syntax checks passed for every changed JavaScript file and `sw.js`; asset/reference validation, scoped secret scan and `git diff --check` passed. No focused test was added because no new client defect was reproduced.

Phase 1 remains **NOT COMPLETE**. The exact blocker is the isolated project's required email confirmation, which prevents legitimate automated test sessions. After the isolated-only Confirm email setting is temporarily disabled or official Admin Auth access is supplied, create fresh supported synthetic users and execute save, reload, offline/reconnect, account switch, conflict and delete/full-sync in the browser. Realtime tombstone delivery is not a rollout blocker because durable full-sync reconciliation is the correctness path. Only after that matrix passes should the precisely scoped main compatibility work be prepared for review.

### Phase 1.9b resumed Auth verification

The supported signup path was retried after the operator reported that **Confirm email** had been disabled. All requests targeted only `nimezwserwvrsbyogjox` and used `supabase.auth.signUp()` semantics through the public Auth endpoint; no internal Auth table was touched. Four minimum roles were attempted with fresh synthetic `@example.com` addresses and temporary credentials stored only in the operating-system temporary directory. No authenticated session or usable user ID was returned. The temporary credential file was then deleted and its absence verified.

The exact live Auth evidence was:

- A fresh `/auth/v1/settings` response still reported `email: true`, `disable_signup: false`, and `mailer_autoconfirm: false`. In GoTrue this means email signup remains subject to confirmation rather than producing an immediately confirmed session.
- The supported signup attempt returned `email_address_invalid` for an `@example.com` identity.
- Subsequent batch attempts returned `email_address_invalid` and then `over_email_send_rate_limit`; none returned an access token/session.
- No legitimate Phase 1.9b test users or sessions were created.

Per the task's stop condition, no alternative public domain, inbox, internal Auth-row mutation, production setting, or unsupported token construction was attempted. The authenticated browser matrix therefore remains blocked at session establishment and was not executed. The exact remaining operator action is to verify in the **isolated project** dashboard that Auth → Providers → Email → Confirm email is actually disabled, save the setting, wait for propagation, and confirm that `/auth/v1/settings` returns `mailer_autoconfirm: true`. The email-send rate-limit window must also expire before retrying. Production must remain unchanged.

The previously documented minimum-main compatibility delta remains current; remote `main` was not checked out or modified. Phase 1 is still **NOT COMPLETE** and is not ready for the main compatibility-release step until a supported isolated signup returns a real session and the six authenticated browser scenarios pass.

### Phase 1.9b authenticated browser matrix completed

A later live settings check returned `mailer_autoconfirm: true`, with email signup enabled. Four fresh synthetic users (owner, editor, viewer and account-switch user) were created only in `nimezwserwvrsbyogjox` through the supported public `signUp()` API, and every signup returned an authenticated session. Unique `mailinator.com` test addresses were used; no reserved domain was used. Credentials existed only in the operating-system temporary directory during the run and were deleted afterward. No internal Auth table was written directly. The existing incomplete Phase 1.8 Auth fixtures were left untouched.

The browser harness was temporary, outside the repository, and loaded the current working-tree `assets/cloud-sync.js` over local HTTP. It created a Supabase client for the isolated URL and instrumented requests without changing their semantics. The deployed site and production configuration were never repointed.

Authenticated browser results:

- **Save — PASS.** `queueTripSave()` first persisted `pending`, issued exactly one `POST /rest/v1/rpc/save_travel_trip`, received HTTP 200, then persisted `synced` with server timestamp and `cloudRevision: 1`. The server and local trip matched.
- **Reload/hydration — PASS.** A new document load retained the authenticated session, performed one visible-row query and one tombstone RPC, restored the same trip at revision 1, and produced exactly one local record.
- **Offline/reconnect — PASS.** The harness rejected isolated-project network traffic, then queued an edit. The edit, mutation UUID and revision remained in localStorage with `syncStatus: failed`. After a real page reload and reconnect, the online recovery path reused the retained edit, saved it through the RPC, and reached revision 2 with `syncStatus: synced`. The first harness display sampled `failed` too early after dispatching `online`; correcting only the harness wait exposed the already successful server acknowledgement. No application patch was needed.
- **Account switch — PASS.** An owner save RPC was deliberately delayed, the client signed out, and the account-switch user signed in before the response returned. The late owner HTTP 200 did not enter the second account's active storage. The active user ID matched the switch user and the visible trip list was empty.
- **Conflict — PASS.** Owner and editor browser origins both hydrated revision 2. Owner saved `session-A`, advancing the server to revision 3. Editor then submitted its stale revision. The editor made one RPC call, retained its `session-B-stale` local payload, recorded `syncStatus: conflict`, and did not issue a blind retry. A direct isolated database read confirmed revision 3 and `session-A` remained authoritative.
- **Delete/tombstone/full sync — PASS.** The owner reconciled the latest row and deleted it through exactly one `delete_travel_trip` RPC. The server advanced the tombstone to revision 5 with non-null `deleted_at`. The stale editor then ran full sync, called `list_travel_trip_tombstones`, and ended with zero local copies. A subsequent explicit stale browser save returned `TRIP_DELETED` with revision 5 and did not recreate a local or server row. A separate browser-created trip with `archived: true` remained revision 1 with `deleted_at: null`, proving Archive remains separate from Delete.

The editor and viewer memberships required for the synthetic shared-trip matrix were inserted only into the isolated project's `trip_members` test data after verifying the project ref. Auth identities themselves were created exclusively through `signUp()`.

Performance observation found no duplicate save/delete RPC, duplicate full sync, retry storm, repeated hydration, uncleared visible queue behavior or duplicate listener effect. Each ordinary save/conflict/delete produced one corresponding RPC. Each explicit full sync produced one trip list request and one tombstone request. The account-switch test contained one intentionally delayed save request and one late response. No dependency, framework, polling or application code was added.

With the authenticated browser matrix complete, the Phase 1 persistence contract is **READY FOR THE SEPARATE MAIN COMPATIBILITY RELEASE STEP**. This does not authorize or perform that step. Current `main` remains incompatible until the already documented minimal `assets/cloud-sync.js`, `sw.js`, four-entry-page version graph and focused tests are prepared and reviewed. Production migration remains prohibited until compatible frontend releases have been validated on both branches and the cache/client update gate is satisfied.
