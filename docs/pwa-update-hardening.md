# PWA-first update hardening — review and acceptance evidence

Branch: `post-rc/pwa-update-hardening`
Base RC: `8f87d5376fb3e8f5d492228eb07771f7f247b0c2`
Observed remote Preview: `7edd763b9132fac91b3287aaa593d2f107e4dbe6`
PR #154 remains the existing draft RC. This task neither merges nor changes it.

## Root cause and existing ownership

`app.js` is the sole registration owner. Previously it registered `sw.js?v=<manually maintained date>`; HTML and feature-loader URLs used the same manual revision. `tools/bump-version.mjs` maintained those source revisions, while Preview copied source files without stamping the deployed commit. Cache-first versioned resources could therefore retain an old body when a deployment reused a URL. The worker also called skipWaiting during install and clients.claim during activation, without a matching client refresh contract. A running page kept its already evaluated JavaScript after a worker update. Navigation was already network-first and the offline trip fallback was already correct; neither needed a rewrite.

## Canonical deployment owner

Preview's existing static staging now calls `node tools/stamp-web-build.mjs _site`. Git HEAD supplies the exact web revision; the existing About release supplies the application version. The tool stamps asset URLs, the existing worker ASSET_VERSION and app fallback, and generates `build-info.json` plus `assets/web-build.js`. The worker's existing CACHE_SCHEMA supplies the cache namespace. The generated diagnostic is loaded before app.js in each entry page and is cached with the same SHA, so it describes the loaded page rather than a newer server response.

The date revisions and bump tool remain compatible with unstamped source/native staging. They do not control a stamped Preview deployment. No manual date bump is required for normal web changes.

## Final update/cache contract

- Navigation stays network-first, including recovery from HTTP 5xx and the canonical offline trip shell.
- SHA-versioned JS/CSS use exact URL cache matching. CacheStorage lookups are restricted to the active worker's application cache, avoiding reads from a waiting deployment's cache.
- Installation downloads the existing shell/icons plus web JS/CSS feature bundles (approximately 2.28 MB before compression). This ensures an accepted update does not discard the only offline copy of Plan/Budget/Places/Documents feature code. Feature execution remains lazy; photos and documents are not bulk-downloaded. Native widget bridge scripts are excluded from this additional precache.
- A new worker waits. The existing registration owner checks at startup, visible pageshow/focus and reconnect, throttled to 30 seconds. A single button reads `גרסה חדשה זמינה — רענון`.
- No unsolicited reload happens while a page is open. Clicking the button activates the waiting worker and reloads that page once on controllerchange. Another open window offers a refresh instead of being forcibly reloaded.
- If all old windows close, browser lifecycle may activate the waiting worker automatically. Reopening loads the latest shell. Failed installation leaves the existing worker usable.
- Activation deletes only matching historical TravelMate application caches, including old date revisions and SHA revisions. It never clears localStorage, IndexedDB, cloud data or unrelated caches.

## Preview → RC classification and preservation

The task begins from the whole exact RC, not stale Preview. No RC fixes were selectively reconstructed or reverted.

| Classification | Relevant Preview → RC changes | Treatment |
| --- | --- | --- |
| WEB/PWA | app/home, notifications, Plan/category/reviews, Budget/trip experience, Profile/Mate, security UI, RTL/layout, Hero/Weather, entry HTML, SW, manifest and installed-PWA icons | Inherited unchanged except the narrowly scoped registration, About diagnostic and SW lifecycle changes documented here. |
| SHARED | app-shell CSS/JS, account/cloud-sync isolation, trip/runtime contracts and shared icon outputs | Existing guarded runtime remains intact; no new native dependency. |
| ANDROID-NATIVE-ONLY | android project/resources/SystemBars/widgets/signing, Capacitor configuration/toolchain/native staging; native widget snapshot/action injection and adaptive icon source | No edits; Android remains bundled `webDir=dist`, no server.url. The existing Pages excludes still exclude Android/iOS/config. Native bridge scripts are neither injected into PWA HTML nor added to web feature precache. |
| OTHER NATIVE-ONLY | iOS project/widgets/native workflows | No edits or builds. |

Preserved RC behavior: shared bell opens/second tap closes/reopens; usable close control below shell header; no zero badge DOM, exact positive count; solo hidden; refresh and account/logout/reconnect isolation; Hebrew presentation with canonical category codes unchanged; one canonical reviews action; landing/login and authenticated safe areas; RTL/Back; approved Hero/Weather/icon; Budget/Profile/Mate and original offline/data owners.

## Runtime evidence

Real Chromium Service Workers were enabled, using an HTTP server that switches staged deployments at the same origin without replacing the browser context.

1. Future-update fixture: SHA `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` → `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` through the actual Preview stamping tool. The harmless web-only difference is the generated revision and versioned asset URLs; no APK is involved.
2. Bootstrap migration: Build A is an unmodified git archive of exact Preview `7edd763b9132fac91b3287aaa593d2f107e4dbe6` (its loaded app.js body is checked against that archive), followed by stamped Build B. Reopening discovers the new page/registration and the explicit refresh activates the new worker.
3. An unsaved textarea survives update discovery; accepted refresh loads B exactly and removes the update button. About shows loaded SHA B and the active SW cache revision B.
4. Existing trip ownership, activities, canonical categories, saved places, expenses, preferences and fixture account/document metadata survive. IndexedDB document records and unrelated CacheStorage entries survive. Canonical hydration changes syncStatus from pending to local; that transport-status field is excluded from user-field comparison, while other fields remain compared.
5. After offline mode and closing/reopening the page, Overview, Plan (including the saved activity), Budget, Places and Documents surfaces are visible on B. A different owner cannot retrieve the previous owner's trip through the canonical TripStore API.

Limit: account/session and private-document checks use synthetic local fixtures. No live Supabase user credentials or private records were used. Existing cloud/account lifecycle regressions also pass, but live authenticated phone restore/update behavior remains a physical retest requirement. Documents UI availability does not imply that uncached private document bytes become available offline. A browser page close/reopen approximates PWA reopening; this is not an Android OS force-stop test.

## Validation

- Baseline existing SW/offline tests: 8 passed before edits.
- Focused SW/stamping/offline contracts: 11 passed.
- Samsung RC focused browser regressions: 25 passed (9 notification, 4 category/reviews, 12 landing/home/short-layout).
- Full Node suite: 915 passed.
- Full Playwright suite: 132 passed, no retries (130 existing plus 2 actual-worker update tests).
- Updated About/active-worker diagnostic and 390×568 update flow: both update tests passed again after the diagnostic change.
- Preserved layout matrix: 360/390/430, light/dark landing and authenticated home, 568px short height; full suite includes RTL, Back, Profile, Mate, Weather/Hero and feature/data contracts.
- Changed JavaScript syntax and diff whitespace checks pass. No Android build, Preview deployment, Supabase schema change or production deployment occurred.

## Daily workflow and approval boundary

After explicit approval to update Preview: normal HTML/CSS/JS changes use commit → successful Preview Pages deployment → open/reopen the browser-installed PWA → accept refresh if offered. No APK rebuild or reinstall is needed. Android widgets/plugins/permissions/manifest/Kotlin/Java/SystemBars/resources/icons still require the native build/QA path.

Current status: READY FOR PREVIEW UPDATE TEST. The exact task commit must be approved for Preview publication before testing the physical installed PWA. This does not authorize merging PR #154. Keep that PR draft.

Risks: first stamped install/update downloads the feature bundles; network failure or storage quota failure keeps the old worker active. Live phone testing remains necessary. Rollback must be a normal approved Preview revert/redeployment with a new commit SHA so the same update contract can deliver it; do not clear user data or assume restoring old manual-version SW code will promptly update an already installed client.
