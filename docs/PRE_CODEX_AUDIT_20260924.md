# TravelMate Pre-Codex Audit — 2026-09-24

## Purpose

This document is the handoff baseline for the next Codex work package. It records verified runtime health, current technical debt, and the consolidation map so visual work does not accidentally mix with risky data-layer refactors.

## Current baseline

- Branch: `preview`
- Baseline after regression-guard merge: `dfb5499bd3cee5dae4f262502336461fbd0586a6`
- Visible assistant brand: **Mate**
- Compatibility-sensitive internal assistant API: `window.TravelMateNavo`
- Service Worker: `travelmate-smart-v190`
- Asset version: `20260924-05`
- Main and Supabase Production are out of scope for pre-Codex hardening.

## Verified health

- JavaScript syntax: 0 failures across all asset JS files.
- GitHub Actions Preview workflow: Verify + Deploy green after hardening.
- Asset integrity: all HTML local references, Service Worker core paths, and dynamic feature-loader assets exist.
- PWA manifest: local start URL, shortcut URLs and icons exist; standalone, Hebrew, RTL metadata is retained.
- Runtime matrix after hardening: 40/40 across 10 trip views × mobile/desktop × Light/Dark.
- Runtime matrix had no horizontal overflow or page errors; RTL and Hebrew document metadata remained intact.
- Mate recommendation banner is visible on Overview only.
- Skip link remains available to keyboard users but does not steal focus or remain visible on phone startup.
- Visible legacy `נבו` / `Nevo` branding and accidental `TravelMateMate` are guarded by tests.

## Safe consolidation already completed

1. Removed four unused legacy contrast layers:
   - `contrast-core.css`
   - `contrast-detail.css`
   - `contrast-final.css`
   - `contrast-view.css`
2. Consolidated `place-auto-fill-v2.css` into `place-auto-fill.css` while preserving cascade order.
3. Restored `readable-glass.css` override debt from 367 to the existing ceiling of 359 `!important` declarations.
4. Added PR verification to the Preview GitHub Actions workflow. Deployment remains push-only.
5. Added asset/cache, PWA, branding and compatibility regression contracts.

## Consolidation map — do not lose this

### A. Trip data ownership — HIGH RISK, postpone until after visual stabilization

The `travelmate-trips` storage key is read or written by many modules, including:

- `ai-assistant.js`
- `app.js`
- `auto-planner.js`
- `custom-trip.js`
- `getaway-fix.js`
- `lodging-manager.js`
- `place-directions.js`
- `smart-plan-tools.js`
- `transport-planner.js`
- `travel-services.js`
- `trip-intelligence.js`
- `weather-widget.js`

Target end-state: one trip-store/data access boundary built around `TravelMateCloud` / a shared TripStore, preserving offline edits, account isolation, revision conflicts, tombstones and retry semantics.

**Do not refactor this during the Codex visual pass.**

### B. Places / discovery / media — MEDIUM-HIGH RISK

Overlapping responsibilities currently exist across:

- `nearby.js`
- `place-auto-fill.js`
- `lodging-manager.js`
- `getaway-fix.js`
- parts of `app.js`

Repeated concepts include Overpass access, geocoding, distance calculations, categories, safe external URLs, POI image/media enrichment and caches.

Target end-state:
- shared geocoding/network helper
- shared POI/category normalization
- one place-media resolver
- one cache/error policy
- UI modules remain separate where their workflows are genuinely different.

### C. AI surfaces — MEDIUM RISK

Three user experiences overlap:

- `ai-assistant.js` — conversational Mate
- `trip-intelligence.js` — proactive trip recommendations
- `smart-hub.js` — task-oriented smart tools

The UI surfaces should remain distinct, but request/session/context/error handling should converge on the internal assistant API.

Compatibility rule: visible brand is **Mate**; internal `TravelMateNavo`, `navo-*` storage/event/API identifiers remain unless a deliberate migration is designed and tested.

### D. Routing / transport — MEDIUM RISK

Overlapping navigation and route responsibilities exist in:

- `place-directions.js`
- `transport-planner.js`
- `travel-services.js`
- direct Google Maps links inside Places/Planner

Target end-state: shared routing/link builder and shared destination/coordinate model; keep Transport planning and single-place directions as separate UX flows.

### E. Dialog/focus infrastructure — MEDIUM RISK

Multiple modules implement their own dialog creation, Escape handling, focus trap and focus restoration.

Target end-state: shared modal/dialog behavior with feature-specific content. Preserve the accessibility contracts already covered by tests.

### F. Shared utilities — LOW-MEDIUM RISK

Repeated utility functions include `escapeHtml`, `safeUrl`, `distance`, `geocode`, date helpers and JSON storage helpers.

These are candidates for a small shared utility layer after feature ownership is stable. Avoid a broad utility refactor solely for line-count reduction.

### G. CSS ownership — PRIMARY CODEX VISUAL TARGET

Current large ownership layers:

- `theme.css`
- `readable-glass.css`
- `trip-redesign.css`
- `styles.css`
- feature-specific CSS

Current debt ceilings remain intentionally strict:
- `theme.css`: 1560 `!important`
- `readable-glass.css`: 359
- `trip-redesign.css`: 119
- combined: 2038

Codex should reduce competing visual owners rather than raise these ceilings. Do not add new global contrast patch files.

## Codex visual-pass boundaries

Codex **may**:
- consolidate card/surface/button/typography/spacing ownership
- reduce CSS specificity and `!important` debt
- improve Light/Dark, RTL, 390px mobile and desktop consistency
- fix visual white-on-white, glass contrast, borders and touch target issues
- add visual regression contracts when useful.

Codex **must not** during the visual pass:
- change `main`
- mutate Supabase Production data or deploy Production Edge Functions
- redesign the sync/revision/tombstone model
- rename compatibility-sensitive internal Navo identifiers
- introduce a new place/media backend
- combine functional modules merely because their UIs look related
- raise CSS debt ceilings to make tests pass.

## Final consolidation phase

After visual stabilization and personalization work, perform a dedicated consolidation phase:

1. central trip-store/data boundary
2. shared Places/geocoding/media/network services
3. shared AI request/context layer
4. shared routing/link builder
5. shared dialog/focus utility
6. utility deduplication
7. final CSS ownership cleanup
8. delete only code proven unreachable after runtime + tests
9. full phone/desktop/PWA/offline regression
10. Release Candidate only after green CI and deployed runtime verification.
