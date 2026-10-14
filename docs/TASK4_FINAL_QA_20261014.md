# TravelMate Task 4 — final QA and roadmap reconciliation

Audit date: 2026-10-14. Overall status: PARTIAL. Integration acceptance and commit/push: BLOCKED.

## Exact candidate and scope

- Branch: codex/afternoon-automation-20261014.
- HEAD: 32eadf7f1af38dd952e399868626057e8dc362fc, with uncommitted Task 2 and Task 4 changes. This HEAD identifies the baseline, not the modified candidate. No new commit SHA exists.
- The live read-only GitHub branches API independently verified preview at the same exact SHA. Local origin/preview also matches. Fetch was attempted and failed because FETCH_HEAD is outside the writable workspace; direct ls-remote failed to connect. Connector verification restores SHA freshness evidence without changing any ref.
- The six pre-existing Task 2 paths were preserved. Task 4 adds changes only to assets/app.js, assets/trip-context.js, assets/plan-live-routing.js, two About highlights, three regression-test files, and this report. About remains the prepared, unreleased 2.24.1; asset versions and service-worker cache revision were not advanced.
- No Task 3 handoff or integrated Task 3 modules exist locally. The local application cannot be represented as the requested fully integrated candidate.
- No main/preview edits, merge, deployment, OneDrive, native build, signing or OTA publication. No Astra escalation or delegated agents.

## Evidence-backed defects fixed

1. Calendar end date: the rendered saved-place Google Calendar URL for 2026-12-31 23:30 ended at 2026-12-31 00:30. Six browser cases failed before the fix. Floating end-time arithmetic now advances the date across midnight, month/year boundaries and leap days; it does not introduce a timezone conversion. The unused time-only helper was removed. Start time, export fields and user data remain unchanged.
2. Completed timing: both completed activities and completed saved places consumed free time, could remain the next fixed commitment, and generated a false transition risk. The deterministic reproduction showed a completed record reducing a four-hour free window to 150 minutes and creating a 115-minute shortfall warning. Filter completed entries at advisory/routing consumers while retaining records and history.
3. Late routing response: a no-pair/offline refresh did not invalidate the previous request generation. A controlled in-flight response could restore advice after completion. Increment the request identity and release the old in-flight slot when falling back to no pairs/offline.
4. Duration edit: the live-routing signature omitted the previous activity's duration. Editing duration reused cached advice for up to 120 seconds. A controlled runtime test demonstrated one provider call where two were required, with an incorrect risk result. Duration now participates in the signature.

All changes are local corrections to existing behavior; Smart Trip 2 and Calendar Phase 1 were not imported. About highlights describe the fixes. Existing Task 2 date-editor and FX guard changes were re-reviewed and their behavioral tests rerun.

## Verification executed in Task 4

| Gate | Result |
| --- | --- |
| Initial full Node, 119 files | 867/867 PASS |
| Initial full Playwright, 18 specs | 180/180 PASS; 0 flaky/skipped |
| Calendar reproduction | 6/6 failed with the exact wrong end date before correction |
| Controlled completion/routing baseline reproduction | 6/6 failed; corrected tests settle promises deterministically |
| Duration-cache reproduction | 1/1 failed before signature correction |
| Final full Node, 121 files | 881/881 PASS; 0 failed/cancelled/skipped |
| Focused final material browser tests | 12/12 PASS, 360/390/430 light/dark |
| Final full Playwright, 19 specs | 192/192 PASS; 0 failed/flaky/skipped |
| All tracked/candidate JS and MJS syntax | 200/200 PASS |
| Independent final screen/overlay matrix | 66/66 PASS; 0 page errors, overflow failures, unsolicited GPS calls or corrupt text |
| Entry pages, SW core and dynamic assets | PASS in asset-integrity contracts |
| git diff --check | PASS |
| First-party replacement/placeholder text scan | No findings |
| Candidate privacy scan | 13 candidate files; no private-key/token/sensitive-path findings; staged set empty |
| Distribution classifier, committed cumulative range and candidate added lines | OTA_ONLY, no reasons; read-only classification only |

The matrix covers Home, Overview, Plan, Places, Budget, Documents, Transport, Group and Memories, plus Settings and Mate, at all six width/theme combinations. The preview ran on 127.0.0.1:4174 with synthetic data and blocked external requests. No production account or private travel data was used. Screenshots and logs are under ignored test-results/task4-evidence/.

Local desktop Chromium navigation DOMContentLoaded ranged from 22.5 to 117.6 ms in the final matrix. These are local measurements, not physical-device or production-network performance claims.

An initial matrix attempted the deliberately hidden Mate launcher on Memories and timed out. The corrected matrix enters Overview before opening Mate; its final 66/66 result supersedes that harness failure. Initial classifier attempts also failed because the REPL lacks process and then used an incorrect relative path; the standalone corrected candidate classifier passed. Incomplete runs are not counted as passing gates.

## Coverage matrix and evidence levels

| Area | Status | Evidence level / limits |
| --- | --- | --- |
| Major local screens, navigation/back, dates, Budget | PASS | TESTED: full browser suite and six-configuration matrix; dates/FX tests retained |
| Existing Smart Trip advisory and Nearby contextual helpers | PASS locally / PARTIAL overall | TESTED helpers and browser consumers; no live provider or GPS-location acceptance |
| Smart Trip 2 preview/confirm/apply/undo and newer Nearby repaint behavior | BLOCKED | NOT TESTED: modules absent locally; remote PR metadata is not execution evidence |
| Mate, Settings, RTL 360/390/430, keyboard and focus | PASS functional / PARTIAL visual | TESTED geometry/focus and existing simulated IME suites; translucency shows background content in Mate screenshots; full mobile visual acceptance remains pending |
| CSS specificity/ownership, overflow, text, dead helper | PASS checks / PARTIAL audit | STATICALLY VERIFIED debt/ownership contracts, first-party scan, changed-helper review; TESTED overflow; no exhaustive contrast/screen-reader certification |
| Account/collaboration, documents and asynchronous boundaries | PASS local / PARTIAL production | TESTED synthetic account/lifecycle/race suites; STATICALLY VERIFIED relevant generation, ownership and output-escaping paths; live owner/editor/viewer RLS/RPC not tested |
| Offline/PWA/service worker | PASS local / PARTIAL release | TESTED existing update-consent/cache/data-preservation/offline suite, including actual archived Preview migration in temporary fixtures; STATICALLY VERIFIED worker/core assets; no real installed-device update acceptance |
| Startup/performance | PASS local / PARTIAL hardware | TESTED local Chromium startup and performance contracts; device/network battery and long-session profiling not tested |
| Privacy/security/provenance | PASS candidate checks / PARTIAL live | STATICALLY VERIFIED candidate/source checks and existing security contracts; TESTED local isolation; backend penetration, provider freshness and live AI not tested |
| Legacy saved-place Calendar link | PASS | TESTED rendered URL, rollover and wall-clock runtime cases |
| Calendar Phase 1 ICS UI/export | BLOCKED | NOT TESTED: absent locally |
| Commit/push and integrated Preview readiness | BLOCKED | Git metadata outside writable root; no commit, push or integration occurred |

External fonts/icons, destination images and live API requests were intentionally blocked for deterministic local QA. Missing provider-rendered visuals in those screenshots are not proof of their production state. Mate's translucent surface is an observed visual acceptance limitation, not a demonstrated cross-account data leak. No new stylesheet was changed based on appearance alone. The PWA browser suite proves its exercised update/data-preservation/offline-shell paths; it does not establish that every never-loaded lazy feature works on first use offline. Some lazy modules are not SW core assets.

## Roadmap reconciliation

Live draft PR heads verified read-only during this task:

| Work | Exact head | Local status |
| --- | --- | --- |
| #160 Smart Trip 2 | 18728b9b5370edd6ce3e030478bf67be02f7de98 | NOT integrated; decision/actions modules absent. Local completion filters overlap a subset of its fixes. |
| #162 mobile corrections | b14bcd63dc1b35312610a2749baafd68f001eca4 | NOT integrated; only the existing Task 2 date fix overlaps. |
| #161 Calendar Phase 1 | 783d495ba8555585f757a727508c86e652079081 | NOT integrated; Calendar builder/UI absent. This task fixes only the active legacy calendar link. |

DONE locally: Quick Add, activity timing modes/day overrides, contextual Nearby/Mate seam, opt-in fixed reminders, existing Plan live routing/opening-hours advisory paths, local account/document lifecycle regression coverage, Task 2 dates/FX fixes, and the Task 4 material fixes and final QA above. This reconciles older roadmap entries labelled future with actual local code/tests; external provider acceptance remains partial.

PARTIAL: authenticated collaboration/device conflict behavior, live routing/opening/weather provenance, closed-app reminder delivery, Budget FX conversion provenance record/account fences from #160, mobile visual/physical keyboard/screen-reader acceptance, and installed PWA release validation.

NEXT: the separate Task 3 integration prerequisite, followed by exact integrated-tree QA. Do not describe the draft PRs' own validation claims as tests run here.

## Readiness and top five next steps

Ready for local browser/PWA user testing of this dirty workspace: YES, with synthetic/local data and the limitations above. Ready as the requested integrated Preview/PWA release candidate: NO.

1. Restore permitted local Git metadata/network access; preserve all existing files and recover/verify the missing Task 3 handoff and exact branch lineage.
2. Integrate the exact reviewed #162/#160/#161 deltas on an isolated branch in the separately authorized integration task; reconcile overlapping date/FX/completion/calendar fixes once.
3. Re-run the complete gates against that exact integrated candidate, including Smart Trip preview/confirm/apply/undo, Nearby repaint races, Calendar ICS privacy/eligibility/overnight cases and lazy/offline assets.
4. Verify physical 360/390/430-class RTL phones, both themes, IME, screen reader, contrast/material readability, and live authenticated owner/editor/viewer/provider flows with isolated fixtures.
5. Commit and push only the verified isolated branch when Git access is restored. Keep Preview merge, release stamping/publication, native/signing and OTA decisions outside this task.

Commit/push were not attempted through the remote connector because the current local branch and unrelated changes could not be safely committed using the permitted Git metadata path. No task changes were staged. The report and fixes remain reviewable in the workspace.
