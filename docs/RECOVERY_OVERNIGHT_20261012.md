# TravelMate recovery verification — 2026-10-12

Scope: local recovery only. No push, merge, deployment, APK publication, schema/provider change, destructive user-data operation, or OneDrive access.

## Baseline and provenance
- Repository: C:/Projects/TravelMate.
- Original clean local Preview: b1fb6b4b8c8274f2d5ac3a7a19832f30c22f30e2; its ref was preserved.
- Verified fetched base: 60087fb29d894774bc0466cbb4c1f7223ab0caa8.
- Recovery branch: recovery/overnight-20261012.
- Existing CSS fix c1ae3babe241ddae396926e976385de766bf112e was inspected and its exact one-line patch reused, without duplicating the Nearby interface.
- Existing Nearby free-search work b40ad73/f368a27 was retained.
- No named Overnight 1–4 handoff artifacts were found in the available repository inventory. Existing source, feature contracts, recent commits, and CI evidence were inspected instead.
- Internal exec shell remains broken after its two setup failures. Permitted Node filesystem/process APIs performed the actual implementation and tests. Git metadata writes require the approved parent process because .git is read-only in the child sandbox.

## CI failure
Run [38173365784](https://github.com/lioracl/travelmate/actions/runs/38173365784), base 60087fb, completed/failure. Job 114570479572: JavaScript syntax passed; regression tests failed; required-files step skipped. Deployment skipped.
Exact failure: test 782, "Today CSS adds no important declarations and repository CSS total remains 212", tests/trip-mode-today-pass9.test.js:132: actual 213, expected 212. Historical CI result: 835/836 passed. Local baseline reproduced the same assertion. The test ceiling was not changed.

## Changes
1. Application/CI: remove the extra Nearby time-fit !important; catch rejected account-subscription startup promises in Settings/Admin so a failed SDK download leaves local preferences usable without unhandled rejections.
2. Nearby: one shared in-flight GPS guard spans consent and search for normal/time-fit entries; repeated clicks cannot replace consent or duplicate GPS/search. Empty results and failed providers have distinct actionable status instead of "success: found 0".
3. Budget/Currency: finite positive expense validation, decimal keyboard, one pending save, snapshotted inputs, and finally-based recovery on upload failure/account switch. Same-currency conversion works without a rate; missing and stale rates are labelled. Unconverted foreign expenses show pending totals/remaining/category/daily summaries rather than invented zero totals. Raw financial amounts/currencies and stored contracts are preserved.
4. Plan/Today: compact optional pinned current/next banner reuses canonical Today selection, excludes flexible/window/done items, opens existing row details, and hides when none. Existing past-day/manual-open/edit/delete/navigation behavior is retained. Navigation rejects blank coordinates via TripContext instead of turning them into 0,0.
5. About 2.22.0 and asset revision 20261012-01. The existing version tool synchronized seven files for coherent service-worker asset updates.
6. PWA test calendar is fixed to its existing October 11 fixture; real timers and all visibility/update/data-preservation/offline assertions remain unchanged.

## Verification
- TESTED: full Node suite 848/848; includes 12 new deterministic runtime regression cases.
- TESTED: syntax checks on all 189 tracked/new JS and MJS files, no failures.
- TESTED: asset revision synchronization, seven canonical files; git diff --check passed.
- TESTED: 27 recovery browser cases passed before the final foreign-expense guards; the two new limited/unlimited foreign-expense browser cases passed after those guards.
- TESTED: existing core feature flow 6/6, flexible/Plan integration 16/16, account/docs/Back/shell/widgets 36/36, PWA migration/offline 2/2 in targeted runs.
- TESTED: final combined browser run 89/89 passed (zero retries), including all 29 recovery cases and 60 existing core/Plan/account/documents/navigation/shell/widgets/PWA cases.
- STATICALLY VERIFIED: required HTML/CSS/JS/static/dynamic assets and imports through asset-integrity contracts; CSS ownership, no new !important, semantic materials, Hero/Weather separation, themes, account and offline contracts.
- Visual inspection: 360px light/dark Plan banner screenshots checked; generated 390/430 screenshots retained locally. Browser fixtures explicitly label synthetic GPS, map, and exchange-rate data. External font/image downloads are limited in this environment; full real-asset/device contrast is not claimed.
- No package.json/lint/build script exists for this static site. Existing Node/Playwright/static checks were used; no framework/build dependencies added to source.

## Not tested and next device checks
NOT TESTED: real Samsung/native GPS prompts and accuracy; real Overpass/Nominatim/map tiles; live currency provider accuracy; live authenticated Supabase sessions; native widgets on physical devices. No ADB/APK/device execution or real GPS claim.
On an authorized Samsung build: open trip → Places → Nearby; deny once then retry with explicit OS permission; verify approximate/precise accuracy messaging and map/list/details/navigation/website/save/return. Add a decimal quick expense; check one saved record, ILS/EUR directions, stale/unavailable rates, and unchanged base budget. In Plan, pin/unpin the next item, open/edit/complete it, reopen a past day, and verify Back and native safe areas. Check airplane-mode cached views and account switch isolation.

## Commit safety
Stage only the explicit recovery source/test/report manifest. Exclude node_modules, test-results, .recovery-tmp, local logs, documents/uploads/GPS histories/databases, and credentials. Perform a staged-path and added-line secret scan before the local descriptive commit. Keep Preview/main refs and deployment state unchanged.
