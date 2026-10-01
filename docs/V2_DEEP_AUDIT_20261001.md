# TravelMate V2 deep audit — 2026-10-01

Baseline: remote preview 1e5280e4fd1af570eed7c26ccc34fea1b0a3f63e.
Local primary checkout: preview 5c69d09d7bdc448c7f65ecb18d6b16c52eefaf61, with unrelated tracked and untracked work preserved.
Isolated branch: codex/v2-deep-audit-20261001.
GitHub run 36826809551: verify and Pages deploy successful. No live database validation performed.
Baseline: node --test tests/*.test.js — 528 passed.

## Pass one: actual contracts and ownership

| Path | Canonical owner and consumers | Audit result |
|---|---|---|
| Profile Lite / User Profile | Auth user_metadata -> user-profile.js fromUser/normalizePreferences -> home.js and security-center.js; edits through cloud-sync.js updateProfile -> auth.updateUser | One persisted profile; fallback display logic and validation are duplicated. |
| Avatar / initials / greeting | user-profile.js derives provider URL, initials, first name and local-hour greeting; Home and security settings present them | No avatar store. Collaboration has separate member initials presentation. |
| Adaptive Home | home.js renderedTrips/currentSession -> UserProfile.selectHomeContext -> existing inline summary | No second trip store; tombstone filtering belongs to upstream sync. |
| Mate | ai-assistant.js collectTripContext -> bounded itinerary/places and expense aggregates -> travel-assistant Edge Function; trip-intelligence.js handles recommendation contexts, declared preferences and fingerprints | Reads TripStore, no new persisted trip system. Auth changes reset chat keys, but pending responses and session-refresh ordering deserve stronger integration coverage. |
| TripContext | trip-context.js schedule modes, day modes, transitions, free windows, coordinate/time estimation -> Plan, Nearby, Trip Analytics | Shared calculation layer. Missing-value coercion requires correction. |
| Trip Store | trip-store.js delegates get/save/update/conflicts to TravelMateCloud, legacy fallback travelmate-trips | Canonical facade. Ownerless matching is legacy compatibility, not authenticated ownership evidence. |
| Cloud Sync / conflicts | cloud-sync.js user-partitioned snapshots, revision RPC, mutation IDs, generation checks, tombstones, explicit conflict resolution; custom-trip.js refreshes canonical overview | Existing RLS/RPC boundaries unchanged. Revision, owner isolation and conflict tests pass. |
| Plan | custom-trip.js planner edits through TripStore; plan-ux-polish/free-time-finder use TripContext | Canonical activities/dayModes, no new planner store. |
| Places | app.js planner savedPlaces and nearby.js search/enrichment; persisted through existing trip path | Search/cache distinct from user trip data. Full renderSaved scans all days per place and recreates rows. |
| Budget | trip-experience.js state.expenses/categories -> saveTripData -> TripStore; fallback travelmate-experience:<tripId>:<field>; private receipt paths through existing storage | Duplicate fallback storage, cached full trip and account-unscoped keys remain. |
| Trip Analytics | trip-analytics.js builds completed facts and movement via TripContext; buildPersonalStats filters ownerId | Pure derived helper, no analytics storage. Anonymous ownership and distance status bugs. |
| Replay / Memories | trip-replay.js reads TripStore, calls TripAnalytics and presents done items + trip memories; explicit story action emits Mate prompt | Existing memories persist via trip-experience. Replay sums mixed currencies incorrectly. Memories are explicit story input, never learning input. |
| Learned Preferences | learned-preferences.js pure evidence/candidate/transition/export functions; only confirmed items export, disabled learning/rejected/deleted export null | No runtime persistence or auto-learning orchestrator; source-kind allowlist, categories and IDs only. |
| Cross-Trip Learning | buildCrossTripSuggestions in learned-preferences.js, ownedTrip owner gate, done=true categories, >=2 distinct trip IDs | Foreign/shared-recipient and deleted trips excluded. Duplicate snapshots skew confidence denominator. Owner collaboration cannot distinguish who performed a completion. |
| Existing preferences | Auth metadata travelmate_preferences is declared user preference; trip.preferences stays trip-local; theme/language localStorage are UI settings | No second Preference Store. LearningEnabled currently gates export, not an automatic learning job (none exists). |

Personal Travel Intelligence is contract-first and pure-helper based. No second Profile, Trip Store, Preference Store or persisted Analytics system exists. The draft learned-preference schema is documentation, not an applied migration.

## Pass two: severity findings before fixes

CRITICAL: none established by the inspected paths and existing tests. This is source/test evidence, not a live database security certification.

HIGH — trip-experience.js storageKey and init/saveTripData: legacy Budget/Memories fallback keys omit account/owner; state.trip and arrays are captured at init and do not subscribe to canonical replacement. This creates a credible cross-account fallback/stale overwrite risk. A safe repair needs explicit legacy migration and account-switch/sync integration tests; do not casually remove storage.
HIGH — future personal-learning rollout: ownership excludes received shared trips, but owned collaborative trips lack completion actor attribution and reviewed-item persistence/deletion reconciliation. Do not automatically activate personal learning on these records.

MEDIUM — buildPersonalStats compares empty authenticated ID with empty ownerId, including ownerless trips.
MEDIUM — TripContext.coordinates coerces null/empty/whitespace coordinates to zero, fabricating movement and arrival estimates.
MEDIUM — Analytics number(null) returns zero: manual-only segments report distance coverage and estimated distance despite absent coordinates.
MEDIUM — duplicate same-ID trip snapshots alter cross-trip coverage/confidence and repeat evidence; missing trip IDs can form invalid provenance.
MEDIUM — Replay adds different currencies then labels the sum with the most common currency.
MEDIUM — Mate async session refresh can overwrite newer auth preferences; pending responses/account-switch and cached recommendation state need lifecycle tests before refactoring.
MEDIUM — Replay refresh listeners cover planner/places but not all canonical expense/memory or cloud replacement events; UI may lag canonical writes.
MEDIUM — Budget chart calculations/render calls repeat and renderSaved rescans/rebuilds days/rows. Optimize only with measured flow coverage.

LOW — Cloud updateProfile duplicates UserProfile preference options/normalization; Home and settings retain profile fallback logic.
LOW — app.js scheduling-mode observer scans generated rows despite planner/places events. Existing singleton guards limit duplicate loading; observer lifetime is page-wide, not proven a leak.
LOW — readable-glass.css: 94 !important rules / 132286 bytes; trip-redesign.css: 30 / 49723 bytes. Broad CSS rewrites are outside this task.
LOW — largest scripts: trip-experience 111480, about 92445, nearby 92055, place-auto-fill 75474, app 72282 bytes. Existing feature registry lazy-loads assistant, account, Plan, Places and Memories; no new dependency warranted.
LOW — no package.json or pinned local Playwright test package; Playwright config and four E2E specs exist.

## Focused implementation scope

Initially the five bounded numeric/ownership/provenance/currency fixes above; the final trace also justified one name-only profile patch. Keep RLS/schema and the visual system unchanged. Add behavioral VM regression tests, run the full Node suite, syntax and asset checks, and attempt the existing Playwright suite. Update release/cache versions for deployed behavioral fixes.

## Privacy recheck criteria

Learning only reads done categories and stable IDs from owned, nondeleted trips; never documents, receipts, memories, messages or GPS. Suggestions remain suggested; no export without explicit confirmation. Rejected/deleted/disabled exports remain null. Keep remaining collaboration/review persistence limitations visible. No migrations or database changes.

## Merge gate

Do not merge to preview while HIGH lifecycle/learning rollout findings remain or relevant E2E failures are unresolved.


## Final review additions and implementation

HIGH — fixed: Home calls cloud.updateProfile(displayName) without preferences. Before this patch the cloud helper wrote travelmate_preferences:null, deleting declared preferences and resetting a saved learning opt-out. Name-only updates now omit that field; explicit preference edits/resets retain their existing contract. Auth user_metadata remains the canonical owner. API reference: https://supabase.com/docs/reference/javascript/auth-updateuser.

HIGH — remains: ai-assistant.js sendMessage awaits getSession/getClient/invokeAssistant, then appends to mutable state.messages and persists to mutable storageKey. onAuthChange resets storageKey/history but does not invalidate that pending request or cached state.session. A response started under account A can therefore appear in account B's conversation. No new leak is introduced by this patch; the pre-existing lifecycle risk blocks release.

Six bounded fixes:
1. Name-only profile updates preserve declared preferences and learningEnabled.
2. Personal stats require a nonempty authenticated user ID.
3. Null/empty/whitespace coordinates remain unknown; numeric zero stays valid.
4. Manual travel time without coordinates has zero distance coverage and unknown distance status.
5. Learning uses each owned stable trip identity once; missing trip identity is rejected.
6. Replay suppresses a combined money total when currencies differ; keeps expense count and single-currency totals.

No new abstraction, storage namespace, dependency, CSS, screen, database change or migration. About release is 2.4.1; cache version is 20261001-1 across all seven canonical versioned files.

Validation before reconciling concurrent preview:
- Baseline full Node suite: 528/528.
- New regression suite: initial six cases reproduced six failures; additional profile preservation test reproduced its failure before the profile fix.
- Final Node suite: 537/537, including nine focused behavioral/privacy regression cases.
- Post-fix architecture/ownership/asset selection: 47/47.
- Existing Playwright suite: initial runner failed to launch missing Chromium revision 1234; temporary config used installed Chromium 1243 and port 4187 (4173 unavailable). Existing 24 cases then passed.
- Added two actual-browser integration cases for canonical Replay/Analytics and name-only Cloud profile updates. Full browser suite: 26/26.
- Syntax checks for every assets/*.js, sw.js and the changed/new test scripts passed.
- Entry-point, dynamic loader and service-worker asset checks passed; version sync passed.
- Private-source getter guards prove cross-trip builder does not access documents/receipts/memories/messages/credentials/medicalNotes/GPS. Confirmed Mate export exposes only preference key/value/state/scope; suggested/rejected/deleted/disabled exports remain blocked.
- Source and contract checks retain one Profile, Trip Store and Preferences owner; Analytics still calls TripContext, Replay still calls Analytics/TripStore, Mate still uses canonical trip/profile contracts.
- RLS and database files are unchanged. No live database writes or tests against private production data.

Preview advanced during the audit to ade0a4a14aace09e160b1bf2b7aeca55265a783d (personal stats coverage/truncation metadata); run 36828470347 passed. The audit branch must preserve that concurrent change during reconciliation.

Remaining findings: HIGH account lifecycle isolation for Mate and Budget/Memories; HIGH future collaborative learning attribution/review/deletion gates; MEDIUM recommendation auth-refresh ordering and Replay canonical refresh coverage; MEDIUM repeated chart/render calculations; LOW duplicated normalization/fallbacks, DOM observer/scan debt, CSS/payload debt and test-tooling reproducibility. No CRITICAL defect established.

Recommended next task: account-switch and canonical replacement regression coverage for Mate, Budget and Memories, then targeted lifecycle fixes and a safe owner-partitioned legacy-storage migration. Keep automatic personal learning disabled until collaboration attribution and durable review/deletion controls are designed.

Merge decision: keep the branch isolated; remaining HIGH findings mean the architecture/privacy release gate is not clean.
## Reconciled final verification

Final baseline/current preview: ade0a4a14aace09e160b1bf2b7aeca55265a783d. Its Pages workflow 36828470347 succeeded.
The unpublished audit commit was rebased onto this SHA. The analytics overlap was resolved by retaining preview's coverage weights/truncation metadata plus the audit's missing-value, distance-status and authenticated-owner guards. Preview was not modified.

Final checks on the reconciled branch:
- node --test tests/*.test.js: 537 passed, zero failed/skipped.
- Focused architecture/privacy/asset command (12 test files, including v2-deep-audit-regression): 56 passed.
- Existing four E2E specs plus tests/e2e/v2-deep-audit.spec.js: 26 passed, zero retries; installed Chromium 1243, local preview port 4187.
- Syntax: all assets JS checked during implementation; every changed JavaScript file checked again after reconciliation.
- git diff --check and canonical asset version checks passed.
- Staged content/path review excludes secrets, credentials, personal documents, generated databases and runtime test artifacts.
- git diff origin/preview -- supabase is empty; no database, RLS or migration changes.
- No CSS or broad visual redesign. Profile/Mate/Learning/Analytics/Replay still use the original canonical systems.
- Local tests do not certify live RLS deployment or authenticated multi-account behavior; the HIGH lifecycle findings remain.

Additional deferred contract gaps:
- Analytics excludes completed records without dates while Replay counts them, so totals can diverge; choose explicit visit/date coverage semantics before changing counts.
- Analytics returns grouped status/coverage rather than the documented per-metric unit/source/confidence envelope.
- removeEvidence reduces confidence but does not revoke confirmed state when evidence becomes empty. Any future durable learning orchestrator must invalidate deleted-source dependencies and preserve rejection/deletion history before re-generating suggestions.
These are existing contract gaps, not additional feature work in this patch.

Changed files relative to final preview:
- assets/about.js
- assets/app.js (asset version only)
- assets/cloud-sync.js
- assets/learned-preferences.js
- assets/trip-analytics.js
- assets/trip-context.js
- assets/trip-replay.js
- docs/V2_DEEP_AUDIT_20261001.md
- index.html (asset version only)
- sw.js (asset version only)
- tests/e2e/v2-deep-audit.spec.js
- tests/sync-conflict-ui-contract.test.js (asset version only)
- tests/v2-deep-audit-regression.test.js
- trip/custom/index.html (asset version only)
- trip/italy-2028/index.html (asset version only)
- trip/japan-2027/index.html (asset version only)

The audit branch is retained for review. It is not merged to preview because the overall architecture/privacy gate still has the documented HIGH findings. Existing active learning remains contract-only; this patch does not enable automatic learning.

Published audit-branch history was discovered when the first push was rejected: 41f5bdb and d99c02e already existed on the requested remote branch. Their combined tree matches preview ade0a4a. A normal merge preserves those published commits; the analytics overlap retains the exact previously tested audit implementation. No force-push or published-history rewrite occurred. Source content after reconciliation is unchanged from the final 537/537 and 26/26 tested tree.
