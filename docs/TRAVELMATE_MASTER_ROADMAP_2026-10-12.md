# TravelMate — Master Roadmap & Build/Release Plan
**Updated:** 2026-10-12 | **Baseline:** preview `32eadf7f1af38dd952e399868626057e8dc362fc` (2.24.0) | **Status:** planning document, not proof of implementation.

## Product principles
- Hebrew RTL, mobile-first, accessible, fast; retain approved Hero, transparent Weather, themes and existing navigation; no new top-level tabs for every feature.
- GitHub preview is source of truth; work in isolated branches/worktrees, not OneDrive. Small diffs; after two repeated failures investigate/change approach. Run tests, lint/syntax, Playwright, CI; never weaken tests.
- Preview/PWA success != native APK update. No Samsung testing on 2026-10-12. Preserve existing Android application ID/signature/data and offline behavior; do not claim native validation without evidence.
- Smart Trip suggests; user approves. Privacy/consent first, no background GPS by default, no auto-edit of itinerary. Separate planned, manually marked, estimated and measured facts. Mixed currencies are never added without an explicit FX conversion with provenance.
- Every phase has code owner (Codex implementation), ChatGPT product/architecture/review, and user approval for UX/phone acceptance. Publish only after release gates.

## Delivery phases and acceptance gates

### P0-A — Nearby reliability and one-tap search (first functional priority)
**Problem reported:** 'Find nearby place' consistently returns no places; user must click the time-frame control to search.
- Trace Smart Trip entrypoint → event dispatch → Nearby init → location resolution → provider fetch → result normalization → contextual/time/opening-hours/routing filters → rendering. Identify root cause with reproducible tests; do not guess.
- Main action **Find nearby** immediately searches current GPS location after consent (or clear destination/map fallback). Time window is optional, OFF by default; never blocks ordinary search. User can select category, radius (500m/1.5km/3km), GPS/destination/map.
- Distinguish permission denied, no coordinates, provider timeout/rate limit, genuine zero results, and all-filtered results. Provide retry, alternative endpoint where allowed, radius expansion and disable-filters actions. Never silently turn provider errors into empty success.
- Show usable place cards with name, distance, details, navigation, save, add to plan; accessible RTL loading/empty/error states. Do not fabricate ratings/hours. Avoid exposing sensitive location in telemetry.
- Verify category/all-query semantics, Overpass primary/fallback, Wikipedia optional enrichment, abort/race, stale results, filter count, GPS mocked, destination and map; test 360/390/430 widths and offline/error.
**Gate:** one click with valid coordinates + mocked nonempty provider result displays results without any time selection; graceful error/fallback tests pass.

### P0-B — Android/OTA provenance and safety
- Verify actual native source, Gradle/Capacitor configuration, build signing, package ID, release channel, deployed assets and `ota-overlay.json`; trace web SHA and native API compatibility.
- Verify service worker cache update/offline rollback, update prompt/deferred reload, data persistence, native bridge detection, origin restrictions. Never rotate signing key or clear storage.
- If native project/signing identity absent, mark BLOCKED and document exact prerequisites; do not create a replacement APK. No physical-device testing today.
**Gate:** documented supported update mechanism, automated contract tests, honest PASS/PARTIAL/BLOCKED native readiness.

### P1-C — Smart Trip 2.0 / Mate decision engine
- Existing foundations to validate: Flexible/Fixed/Window planning, Today/next activity, Smart Trip Mode V1, contextual Nearby/mood, routing/travel time, opening-hours warnings, weather, profile and consent-based learned preferences.
- Unified deterministic recommendation layer: free time, opening hours, real/estimated transit, arrival buffer, weather, pace, preferences, transport, costs, reservations, accessibility and destination time zone.
- Detect late arrival, closed destination, impossible sequence, weather conflicts and gaps; rank up to 3 actionable alternatives, explain evidence and confidence. **Preview → confirm → apply → undo**. No silent itinerary edits or GPS monitoring.
- One-tap replan, Smart Day Builder, Day Start/Today Brief, Plan Health, quiet nudges, collapsed past days, time zone correctness, manual overrides. Mate conversations reference current trip context with permissions and source transparency.
**Gate:** scenario fixtures (late, closed, rain, no routing, offline, no consent), no automatic mutation, keyboard/VoiceOver semantics.

### P1-D — Budget Intelligence
- Fast expense capture, tiny exchange calculator, multi-currency ledger, unlimited-budget mode, daily spend pace and clear total-to-date; receipt linkage optional. Show converted totals only with explicit FX rate/date; no mixing EUR/ILS.
- Forecast and spending insights optional, privacy-preserving. Consistent Overview/Budget figures and offline sync.
**Gate:** accounting/rounding and sync tests, offline entry and duplicate prevention.

### P1-E — Travel Memories 2.0 / Trip Summary & Replay
- Extend existing Trip Replay and Movement Analytics rather than building a second store. One data contract for summary, replay, share card and movie.
- Narrative trip cover, daily timeline, visited vs planned places, user-confirmed highlights, selected photos/notes, transport by mode, actual vs estimated walking distance/steps, expense categories and totals per currency, memories map and optional purchase locations.
- Editable *presentation* of story (hide/reorder/correct captions/highlights, mark private), without silently changing canonical itinerary/transactions; explicit correction flow for source data.
- User-selectable facts and provenance labels; no claims of measured GPS distance where only routes are estimated. Trip recap from Mate with review/approval. Save/export and offline access where feasible.
**Gate:** verified/planned/estimated provenance, empty trips, missing photos, mixed currency, offline, privacy, and shared-trip permission tests.

### P1-F — Journey Studio: Card + Journey Story Lite
- Entry inside Trip Summary: **Share my trip → Image / Video**, no extra primary navigation tab.
- Image card in 4:5 and Story 9:16; template, destination/date, selected photos, approved stats, map only with reliable data, branded optional footer; export PNG and share via OS where available.
- Video Lite: **30/45/60-second editable storyboard**, 9:16 default with 16:9/1:1 options, scene reorder/add/remove, captions, photos, duration, simple transitions, preview, draft persistence, MP4 export and OS share; fallback when export unsupported. User edits do not mutate trip data.
- **Free licensed soundtrack library INCLUDED IN LITE:** mood presets upbeat city, calm nature, cinematic, romantic, or no music; preview tracks; select music, start offset/trim, volume, fade-in/out, original audio mix where relevant. Mate suggests genre but never forces track.
- Use only tracks with verified documented rights covering embedding, derivative synchronization, export, redistribution and intended social/commercial usage; store attribution/license/track version and required credit. 'Free' or 'royalty-free' alone is not enough. User-supplied files remain private; check platform music restrictions. No copyrighted tracks without appropriate permissions.
- Use lightweight scene JSON and isolated rendering/export worker or platform-appropriate pipeline, not a heavy editor on app startup; lazy-load editor; Android memory/performance fallback; allow cancel, export progress and resume drafts. Explicit permission for cloud processing, default local.
- Default privacy: hide precise location, costs, documents, identity and sensitive metadata. Share only user-approved assets and statistics.
**Gate:** edited preview equals export, music rights/attribution audit, MP4 compatibility, memory/performance budget, Android/Web support matrix, offline/no-music fallback, accessible editing controls.

### P2-G — Journey Story Pro
- User video clips, animated trip route (clearly estimated vs measured), music beat synchronization, richer transitions, multiple tracks, licensed templates, cinematic narrative; avoid scope creep in Lite.
**Gate:** large-media handling, rights, cancellation/recovery, export fidelity, accessibility.

### P2-H — Real movement, health and place verification
- Actual arrival confirmation distinct from scheduled activity; manual check-in as fallback, opt-in location only. Trip replay map, daily/trip walking totals, modes (walk/taxi/metro/train), purchases tied to places with consent.
- Health Connect/Samsung Health integration after Android prerequisites: explicit consent, minimum data scopes, availability and permission denial; never imply Samsung Health is automatically readable. Device validation later.

### P2-I — Experience, collaboration and personalization
- Profile/avatar/greeting, explicit travel style/pace/transport preferences, consent-gated learned preferences with approve/correct/reject/delete, no unapproved learning in Mate.
- Trip-specific background and theme options, visual accessibility, navigation/back policy, archive on All Trips, Settings placement, documents authentication and category grouping.
- Collaboration, shared-trip change alerts, quiet notifications, smart offline pack, widgets (budget/Today/weather), universal search, trip setup wizard, guest/demo onboarding, emergency card and readiness/packing checklist.
- Strengthen Places saved-state and detail flows; reduce redundant cards and startup JS/CSS specificity; no broad visual redesign.

### P3-J — Beta/commercial and documentation
- After multiple real trip tests: guest/demo first, value before registration, account only for cloud save/sync, gradual disclosure, opt-in learned preferences. Evaluate first-trip-free, per-trip and annual options; validate economics/legal/privacy before pricing launch.
- Technical specification, external/internal context and flow diagrams, ERD, integration/security/data provenance, feature-level user guide and release notes. Keep living technical notes during implementation, publish final docs after stabilization.

## Suggested sprint sequence (relative; not fixed dates)
| Sprint | Focus | Delivery | Gate |
|---|---|---|---|
| 0 | Reconcile branch/source and Android provenance | Baseline + risk register | Verified SHA, clean isolated branch |
| 1 | Nearby P0 | One-tap search + diagnostics + tests | Functional contract + Playwright |
| 2 | OTA P0 | Update safety tests and native readiness report | PASS/PARTIAL/BLOCKED with evidence |
| 3 | Smart Trip P1 | Recommendation engine, preview/confirm/undo | Deterministic scenarios + UX |
| 4 | Budget P1 | Quick capture, FX, spend pace | Currency and offline tests |
| 5 | Memories P1 | Unified summary/replay data and editing | Provenance/privacy tests |
| 6 | Journey Studio Lite P1 | PNG, storyboard, licensed music, MP4 | Web/native export and rights gates |
| 7 | Journey Story Pro P2 | Clips, map animation, advanced edit | Media/performance tests |
| 8 | Mobility/profile/UX P2 | Opt-in integrations and polish | Permission/RTL/accessibility gates |
| 9 | Beta and final docs P3 | Pilot, security, manuals | User acceptance + rollback plan |

## Release / deployment runbook
1. For each sprint: write acceptance scenarios → create isolated `codex/<scope>` branch from freshly verified `origin/preview`; never use OneDrive.
2. Make minimal change; unit/contract tests, Node/syntax, Playwright mobile 360/390/430 + RTL + light/dark, accessibility, privacy/security and offline tests. For network services, separate mocked deterministic tests from live smoke checks.
3. Diff review, version/cache/manifest consistency, secrets/license review, dependency and performance check. Commit to branch; PR to `preview`; do not merge until gates pass and user approves.
4. After approval merge/push to Preview, observe GitHub Actions Verify/Deploy, verify deployed SHA/version and key smoke flows. Roll back via known-good commit if regression.
5. Native release is a **separate gate**: source provenance, signing identity, package/versionCode, compatibility, reproducible signed build, update-in-place and data retention, QA on actual device at a later agreed date. Preview web deploy is not APK release.
6. Stable/public Beta only after actual trip testing, permissions/privacy, crash/performance checks, user acceptance, distribution and support readiness.

## Owners, effort, and stop conditions
- **Codex (low/SOL where available):** implementation, focused tests, branch/PR and evidence. Escalate model only on explicit request.
- **ChatGPT:** product spec, acceptance criteria, architecture/code review, release evidence and roadmap maintenance.
- **User:** UX decisions, real-trip/phone validation at a later date, explicit deployment/merge/native publishing approval.
- No invented PASS, no unsupported API promises, no signing-key replacement, no automatic private-media upload. On two identical failures stop and gather evidence.

## Known unknowns / immediate investigations
1. Root cause of Nearby zero results and time-frame activation dependency — **unconfirmed until runtime reproduction**.
2. Actual installed APK's update mechanism and signing/build provenance — **unverified**.
3. MP4 export technology and on-device feasibility — **design decision pending technical spike**.
4. Licensing/redistribution suitability of candidate soundtrack catalogs — **track-by-track audit required**.
5. Source-of-truth consistency for Replay and multi-currency summaries — **contract tests required**.
