# Samsung acceptance fix 3

Baseline: 19692f25b4e6495b7817e174c8162034a600f0ae. Physical Samsung reports override prior synthetic acceptance; new physical retest is required.

## Owners and evidence

- Bell: createLauncher registered only openPanel. Its existing handler now toggles the existing state.open and closePanel owner, with no second listener/state system.
- Panel close: mobile fixed top=66px ignored shell inset/header. Panel z=1200 was below header z=1250. Baseline computed close top=85px while header bottom=108px. New panel begins below the shell top+header boundary; header cannot shrink, close remains 48px, list scrolls inside bounded viewport. 360/390/430 x 844/568 tests cover hit testing, reopening and refresh.
- Zero: previous renderer retained a hidden badge with text 0. The reported physical visibility was not reproduced by the old synthetic fixture. New renderer removes the badge DOM at zero and creates it only for positive unread counts, eliminating dependence on hidden/display for zero. Counts are exact, including 101; session reset removes the node.
- Category: previous translation was only in saved-place renderer. auto-planner activity renderer and smart-plan-tools update wrote raw category. All three now use one TravelMatePlaceLabels.category presentation owner in app.js. Stored canonical codes stay unchanged.
- Reviews: previous guard checked only saved-place-links. Runtime baseline seeded activity had one details action, so the supplied duplicate was not directly reproduced from that seed. Guard now recognizes the canonical reviews class across the row and removes only a secondary enrichment action if a primary action arrives later. Tests cover both record kinds, detail expansion, rerender and late primary rendering. No URL/navigation or layout change.

## Signing

Independent public certificate extraction from the two APK v2 blocks proves certificate drift. See ANDROID_QA_SIGNING.md. Secure stable QA workflow support and fingerprint verification are prepared; owner-provided secrets/variable are required. No private key was generated, committed or exposed. With no configured QA identity, artifacts explicitly report ephemeral signing and cannot promise updates.

## Validation / device acceptance

Focused: 7 notification tests + 3 activity/place runtime tests; 15 previous fix2 tests preserved. Signing guard: 7 Python unit tests. Full regression and exact-SHA CI/artifact details are recorded in the release handoff.

Retest: shared bell open/second tap close/reopen; visible 48px close; zero no badge; positive count; refresh/open; logout/account switch/reconnect/solo; Hebrew activity/place categories; exactly one review action; data restored/preserved; public landing, icon, safe areas, Hero/Weather, keyboard and Budget unchanged.

Profile avatar overlay: DEFERRED to separate post-RC polish. RC blockers and signing continuity take priority; no approved Hero crop/geometry was changed. PR #154 remains draft/unmerged, no main/preview deployment.
