# TravelMate final integration recovery — 2026-10-14

Branch: codex/final-integration-recovery-20261014. Worktree: C:/Projects/TravelMateIntegration/worktree.
Canonical Preview base: 32eadf7f1af38dd952e399868626057e8dc362fc.
The exact final commit SHA is reported with the branch push; this document is part of that commit.
Prepared web candidate: 2.25.0; assets 20261014-01. No release has been deployed.

## Provenance and preservation

| Source | Exact verified SHA | Integration |
| --- | --- | --- |
| Preview | 32eadf7f1af38dd952e399868626057e8dc362fc | clean new branch base |
| Draft PR #162 | b14bcd63dc1b35312610a2749baafd68f001eca4 | mobile delta; identical date fix appears once |
| Draft PR #160 | 18728b9b5370edd6ce3e030478bf67be02f7de98 | complete feature delta, with recovery/ownership corrections and unified release metadata |
| Draft PR #161 | 783d495ba8555585f757a727508c86e652079081 | only Calendar modules, UI/wiring, safe export replacement, styles, worker entries, documentation and tests |

GitHub metadata confirms all three PRs are open Drafts in lioracl/travelmate, based on preview. Remote refs were reverified before completion. PR validation statements are not counted as tests performed here.
The canonical checkout's dirty opening-hours files and other worktrees were not changed. The recovery workspace was not checked out, reset, cleaned, staged or committed. Its binary tracked diff and six untracked recovery files compare byte-for-byte with preserved copies. Evidence backups are at C:/Projects/TravelMateIntegration/recovery-evidence. No OneDrive path was used.
The older Task 2/Task 4 audit documents are retained as historical evidence; this report supersedes their integration/permission blockers.

## Defects corrected

- Reproduced OLD → NEW Plan followed by stale Budget save restoring OLD. Feature saves now apply only their delta to the latest canonical trip, using an allowlisted field boundary, copied baselines, account/owner checks, and record/map merging. Untouched Plan, Budget, Memories, new records and remote field edits survive. Deleted records are not resurrected by stale edits.
- Canonical replacement could resurrect removed Memories/Expenses from stale owned mirrors. Replacement now supplies canonical/default values and refreshes mirrors; a later save/reload cannot restore the old data. Initial legacy migration remains intact.
- Retained Plan, saved-place and day-mode writers now patch owned fields. Realtime canonical replacement refreshes Plan/Places/experience state. Repeated date edits advance their baseline. Async experience cleanup uses lifecycle/trip/account identity rather than save-result object identity.
- All Trips date opener uses editDates, restoring focus correctly.
- Foreign-currency budget saves fail closed without valid dated FX; PR #160's stronger provenance, identity, zero and unlimited contracts are retained.
- Completed activities and saved places do not consume free time or constrain next fixed commitments, transition warnings or routing advice.
- Duration participates in routing signatures. No-pair/offline fallback invalidates late responses. Routing cache/results are scoped to account, owner and trip and invalidated on account/canonical replacement.
- Calendar export uses only eligible exact date/time records, excludes notes/private metadata/GPS, rolls end dates across midnight, and supports offline ICS. Account switching closes/invalidate dialogs; bulk export rechecks account after asynchronous preparation. Legacy default time/unsafe export and unused timestamp helper are removed.
- Mate/Settings mobile viewport, safe areas and touch targets from #162 are retained. Mate's later CSS conflict is corrected with an opaque theme-matched mobile surface. Blocked auth SDK registration is handled without an unhandled rejection; local controls remain usable.
- Nearby guidance now paints estimate tags on every base card before awaiting live routing, then upgrades only after its abort fence. A pending-provider regression reproduced missing tags before the fix; all 15 focused Nearby browser cases and 31 focused runtime/contracts pass.
- Smart Trip 2 real alternatives, Preview → Confirm → Apply → Undo, fresh evidence, activity-hour Weather, and Nearby base-first/zero-GREEN/stale-provider contracts from exact #160 are preserved.
- New Smart Trip and Calendar lazy modules are in the offline shell. Asset version and About metadata are consolidated once.

## Verification status

Final Node: 1033/1033 PASS; no failures/cancelled/skipped.
Final full Playwright: 265/265 PASS, 26 spec files, zero retries/failures/skips (6.3 minutes), run serially against the smoke-verified keep-alive local server.
Focused final ownership/mobile: 11/11 PASS; Calendar/ownership/blocked-SDK 32/32 PASS; mirror save/reload 1/1 PASS. These counts overlap full-suite cases and are not added to its total.
Separate mobile surface matrix: 66/66 PASS at RTL 360/390/430, light/dark. Home, Overview, Plan, Places, Budget, Documents, Transport, Group, Memories, Settings and Mate. Zero unsolicited GPS calls and no horizontal overflow/page errors; Settings and Mate geometry/opacity verified. Representative overlay screenshots inspected. Fonts/icons, imagery and live providers were blocked for deterministic QA, so those rendered assets are not visually certified by this matrix.
Evidence logs, screenshots and preservation copies are outside the source tree at C:/Projects/TravelMateIntegration. Final full-suite logs: node-final.log and playwright-final-serial.log; matrix-final.log and matrix.json; syntax.json; privacy-text.json; staged-privacy.json; staged-distribution.json; preservation.json.

Syntax: 219/219 JS/MJS files PASS. git diff --check PASS. Asset version check PASS.
Candidate privacy/corrupt-text scan: PASS (no private-key/token/forbidden native/private paths or replacement/mojibake findings). No personal trip data or generated browser artifacts are staged.
Distribution: candidate changes and cumulative installed-shell compatibility baseline classify OTA_ONLY, no reasons. No compatibility baseline change or OTA publication.

| Gate | Status | Evidence/limits |
| --- | --- | --- |
| Plan/Budget/Memories lost edits; canonical deletion/replacement | PASS | TESTED deterministic runtime and real controls/save/reload |
| Account isolation and async stale callbacks | PASS local / PARTIAL production | TESTED synthetic account/lifecycle/routing cases; STATICALLY VERIFIED owner/generation fences |
| Smart Trip apply/undo and real itinerary alternatives | PASS local | TESTED Node and Playwright; providers are controlled fixtures |
| Nearby base-first, zero-GREEN, stale evidence; Weather activity-hour | PASS local / PARTIAL live | TESTED controlled providers and source contracts; live travel providers NOT TESTED |
| FX/zero/unlimited/quick expenses | PASS local | TESTED conversion/provenance/account/retained-state and browser persistence |
| Calendar privacy/eligibility/overnight/offline ICS/focus/Back | PASS local / PARTIAL third party | TESTED generated URLs/downloads/allowlist; actual Google save and ICS import NOT TESTED |
| Offline/reconnect, Back/navigation, PWA/SW/assets | PASS local / PARTIAL installed phone | TESTED repository Node/browser regression, STATICALLY VERIFIED cached new modules; installed-device update NOT TESTED |
| Mobile RTL/themes/Settings/Mate/focus/ARIA/viewport | PASS local / PARTIAL physical | TESTED Chromium emulation and simulated keyboard/viewport suites; real keyboard/IME/hardware reader NOT TESTED |
| Independent diff rescan | PASS static | Separate same-agent rescan of state, ownership, races, account fences, dead helper, ARIA/focus and CSS authority; no external reviewer/other model claimed |
| Privacy, secrets, syntax, whitespace, distribution | PASS | STATICALLY VERIFIED scans/classifier and executable syntax/asset contracts |
| Merge/deployment/APK/signing/OTA/production changes | BLOCKED by explicit authorization boundary | NOT PERFORMED; not a code-readiness blocker |

The first broad browser run exposed obsolete collapsed-day fixture interactions; those interactions were corrected through existing controls, with unchanged eligibility/privacy assertions. The first final 263-case run had one pre-navigation Chromium ERR_ADDRESS_IN_USE and 262 passes. All three isolated Home widths passed without retry; the full suite was rerun at lower concurrency. The lower-concurrency run then exposed the delayed Nearby card-guidance defect and passed 262/263; that defect was reproduced with a controlled pending promise and corrected without relaxing assertions. The final-code suite uses a keep-alive local server and serial execution. An initial test-server path normalization error returned 403; that harness run was stopped, the server corrected, and exact HTTP 200 file bytes independently smoke-verified before the final 265/265 run. A staged classifier invocation initially supplied a tree to its commit-only API; staged-patch classification subsequently passed, and the committed range is checked again after commit. Failed/provisional run logs are retained and excluded from final passing totals. No tests were weakened to obtain green.

## Independent rescan and remaining limits

The rescan found and fixed absent-map merging, repeated-edit baselines, experience cleanup, canonical mirror resurrection, routing account invalidation, Calendar account invalidation, Mate auth-registration rejection, the mobile opacity conflict, and the delayed Nearby card-guidance gap. Changed feature fields have one persistence boundary and no obsolete whole-trip fallback. The unused legacy calendar helper was removed. New dialogues use the existing keyboard/focus/Back path, and tests verify their behavior.
No remaining reproducible P0/P1 was found in the exercised local integration scope. This is not proof of all production or physical-device behavior. Cross-device concurrent edits not yet received locally depend on existing cloud conflict controls; authenticated production owner/editor/viewer RPC/RLS/storage and simultaneous-device acceptance were NOT TESTED. Live GPS/routing/opening/weather/FX/AI, actual Google/ICS import, real Android/PWA installation/update, hardware IME and screen readers remain phone/production acceptance tasks. Existing long-term CSS/legacy-writer debt outside this integration was not refactored.

Recommendation: READY FOR PREVIEW/PWA PHONE ACCEPTANCE. All local integrated gates pass. This authorizes no merge or deployment.

## Changed files (65)

- assets/about.js
- assets/ai-assistant.css
- assets/ai-assistant.js
- assets/app-shell.js
- assets/app.js
- assets/auto-planner.js
- assets/calendar-export-ui.js
- assets/calendar-export.css
- assets/calendar-export.js
- assets/home-organizer.css
- assets/home.js
- assets/nearby.css
- assets/nearby.js
- assets/plan-live-routing.js
- assets/plan-ux-polish.css
- assets/plan-ux-polish.js
- assets/security-center.css
- assets/smart-trip-actions.js
- assets/smart-trip-decisions.js
- assets/smart-trip-mode.css
- assets/smart-trip-mode.js
- assets/trip-context.js
- assets/trip-experience.js
- assets/trip-store.js
- assets/weather-widget.js
- docs/FINAL_INTEGRATION_RECOVERY_20261014.md
- docs/TASK2_AUDIT_20261014.md
- docs/TASK4_FINAL_QA_20261014.md
- docs/calendar-export-phase1.md
- index.html
- sw.js
- tests/budget-fx-save-guard.test.js
- tests/budget-v2-contract.test.js
- tests/calendar-export.test.js
- tests/calendar-rollover-runtime.test.js
- tests/completed-timing-runtime.test.js
- tests/contextual-nearby-contract.test.js
- tests/design-system-debt-contract.test.js
- tests/e2e/budget-fx-save-guard.spec.js
- tests/e2e/calendar-export.spec.js
- tests/e2e/nearby-soft-time.spec.js
- tests/e2e/smart-trip-alternatives.spec.js
- tests/e2e/smart-trip-decisions.spec.js
- tests/e2e/smart-trip-soft-time.spec.js
- tests/e2e/task2-p1-regressions.spec.js
- tests/e2e/task4-material-regressions.spec.js
- tests/e2e/trip-ownership.spec.js
- tests/flexible-planning-contract.test.js
- tests/live-routing-opening-hours-contract.test.js
- tests/mobile-core-ui-fixes.test.js
- tests/nearby-one-click-runtime.test.js
- tests/performance-contract.test.js
- tests/plan-live-routing-contract.test.js
- tests/recovery-runtime.test.js
- tests/smart-trip-actions.test.js
- tests/smart-trip-decisions.test.js
- tests/smart-trip-mode-contract.test.js
- tests/smart-trip-soft-time-integration.test.js
- tests/sync-conflict-ui-contract.test.js
- tests/trip-owned-fields-runtime.test.js
- tests/trip-store-contract.test.js
- tests/weather-atmosphere-contract.test.js
- trip/custom/index.html
- trip/italy-2028/index.html
- trip/japan-2027/index.html
