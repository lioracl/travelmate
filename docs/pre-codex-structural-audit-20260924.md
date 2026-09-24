# TravelMate Pre-Codex Structural & Duplicate Feature Audit

Date: 2026-09-24  
Baseline branch: `preview`  
Baseline commit: `dfb5499bd3cee5dae4f262502336461fbd0586a6`  
PWA baseline: `travelmate-smart-v190` / assets `20260924-05`

## Cleanup status update — 2026-09-24

Completed after this audit:
- **Trip Store / direct trip storage: RESOLVED.** `travelmate-trips` is now owned only by `cloud-sync.js` and `trip-store.js`; feature modules consume `TravelMateTripStore` for reads/writes. High-risk writers and remaining direct readers were migrated, while existing trip JSON and cloud sync APIs were preserved.
- **Supabase loader ownership: RESOLVED.** `document-vault.js` now delegates client creation to the canonical `TravelMateCloud.getClient()`; only `cloud-sync.js` owns `window.travelMateSupabaseLoader`. Failed library loads remove the failed script and can be retried.
- **Getaways duplicate implementation: RESOLVED.** The proven corrective search/failover behavior was merged into `travel-services.js`; `getaway-fix.js` was removed from the loader and repository.
- Regression contracts were added to prevent either duplicate from returning.

The Trip Store consolidation target is now **RESOLVED**. The next pre-Codex targets are event payload contracts, loader narrowing, and the remaining CSS ownership debt.

## Purpose

This audit defines the canonical owner of each major capability before the next Codex visual/UX consolidation pass. It is intentionally conservative: identify ownership and duplication first; remove or merge code only in a later, verified consolidation step.

## Verification baseline

- 30 JavaScript assets: syntax PASS.
- 20 contract test files PASS locally.
- `concurrency-contract.test.js` cannot complete on the Remote Desktop machine because `git` is not on PATH; this is a test-environment limitation, not a TravelMate runtime failure.
- PR #83 GitHub Actions: PASS (`Deploy TravelMate Preview`, run 36019907429).
- Runtime view cycle: repeated Overview → Plan → Places → Overview → Documents → Plan → Overview did not duplicate planner toolbar, Nearby panel, lodging setup, Mate banner, AI panel, About modal, or direction modal.
- No duplicate asset requests were observed in the tested runtime.
- Overview cold runtime currently loads ~50 local asset requests (24 JS + 26 CSS), ~1.1 MB transferred from the local static server.

## Canonical capability ownership

| Capability | Canonical owner | Status | Notes |
|---|---|---|---|
| App/bootstrap + dynamic feature loader | `assets/app.js` | KEEP / SPLIT LATER | Loader is canonical, but the file also owns Places persistence and generic modal behavior. |
| Trip bootstrap | `assets/custom-trip.js` | KEEP | Resolves current custom trip and exposes `travelMateTripReady`. |
| Cloud/auth/trip sync | `assets/cloud-sync.js` | KEEP | Canonical cloud store and auth API. |
| Theme/accent | `assets/theme.js` | KEEP | Central semantic theme control. |
| Language | `assets/language.js` | KEEP | Canonical UI language service. |
| Navigation memory | `assets/navigation-memory.js` | KEEP | Back/restore behavior. |
| Network accounting/policy | `assets/network-usage.js` | KEEP | Wraps `window.fetch`; load order is compatibility-sensitive. |
| Nearby discovery/map/GPS/media lookup | `assets/nearby.js` | KEEP | Canonical discovery/search/map layer. |
| Saved Places ↔ Planner integration | `assets/app.js` | MERGE LATER | Should ultimately move behind a single Trip/Place store API. |
| Automatic place/activity fill & replacement | `assets/place-auto-fill.js` | KEEP | Distinct from manual Nearby discovery. |
| Daily planner | `assets/auto-planner.js` | KEEP | Canonical day/activity planner. |
| Smart replace controls | `assets/smart-plan-tools.js` | KEEP AS EXTENSION | UI adapter for `TravelMateAutoPlaces`; not a duplicate planner. |
| Lodging / airport anchors | `assets/lodging-manager.js` | KEEP | Distinct trip-anchor responsibility. |
| Place navigation/share actions | `assets/place-directions.js` | KEEP | Canonical directions/share layer. |
| Transport planning | `assets/transport-planner.js` | KEEP | Separate from place directions. |
| Travel services / car rental / getaway section | `assets/travel-services.js` | KEEP / MERGE GETAWAY FIX | Contains the original Getaways implementation. |
| Getaways corrective implementation | `assets/getaway-fix.js` | MERGE THEN REMOVE | Runtime capture handler supersedes the Getaways submit path in `travel-services.js`. |
| Documents/Vault | `assets/document-vault.js` | KEEP | Encrypted/private document capability. |
| Budget / receipts / memories / currency | `assets/trip-experience.js` | KEEP / SPLIT LATER | Large multi-feature module; currency is also needed outside its primary views. |
| Mate conversation core | `assets/ai-assistant.js` | KEEP | Canonical `window.TravelMateNavo` compatibility API; visible brand remains Mate. |
| Proactive trip recommendations | `assets/trip-intelligence.js` | KEEP EXPERIENCE / SHARE AI CORE | Separate UX, but must consume the Mate core rather than own a second AI stack. |
| Smart Hub tools | `assets/smart-hub.js` | KEEP EXPERIENCE / SHARE AI CORE | Separate experience; AI request plumbing should remain centralized. |
| Weather | `assets/weather-widget.js` | KEEP | Emits requests into the shared Mate path where needed. |
| Collaboration/group | `assets/collaboration.js` | KEEP | Distinct realtime/group capability. |
| Destination hero images | `assets/destination-images.js` | KEEP | Destination-level imagery, not exact POI imagery. |
| About/release information | `assets/about.js` | KEEP / DATA-SPLIT LATER | Very large for release/history content; candidate to move static release data out of executable JS. |

## High-confidence duplication / consolidation findings

### 1. Getaways had two active implementations — RESOLVED

`travel-services.js` wires `[data-getaway-form]`, while `getaway-fix.js` installs a document-level capture submit handler on the same form and calls `stopImmediatePropagation()`.

A controlled runtime submission produced one Nominatim request and one Overpass request through the corrective path. The effective owner is therefore currently `getaway-fix.js`, while the original Getaways path remains in `travel-services.js`.

**Target:** merge the proven corrective logic into `travel-services.js`, add regression coverage, then delete `getaway-fix.js`.

### 2. Trip persistence was decentralized — RESOLVED

Direct `travelmate-trips` access exists in 12 feature files. Full-array writes exist in at least:

- `app.js`
- `ai-assistant.js`
- `auto-planner.js`
- `lodging-manager.js`

The canonical cloud layer already exposes:

- `getLocalTrips`
- `setLocalTrips`
- `upsertLocalTrip`
- `getTrip`
- `queueTripSave`
- `saveTrip`
- `deleteTrip`

**Target:** introduce one canonical Trip Store facade and migrate feature modules away from direct full-array LocalStorage writes. Preserve the current Cloud API and sync conflict semantics.

### 3. Supabase CDN loader was defined twice — RESOLVED

Both `cloud-sync.js` and `document-vault.js` assign `window.travelMateSupabaseLoader`.

The two implementations are similar but not identical: the cloud-sync loader clears the shared promise after a load failure; the vault loader does not. This creates a possible poisoned rejected promise depending on which feature initializes first.

**Target:** one shared Supabase library loader, owned by the core/cloud layer.

### 4. AI experiences are separate, but AI plumbing overlaps — MEDIUM

`ai-assistant.js`, `trip-intelligence.js`, `smart-hub.js`, `weather-widget.js`, and `trip-experience.js` all participate in AI flows. Four modules emit `travelmate:ask-ai`; Trip Intelligence directly consumes `TravelMateNavo`.

This is not a reason to merge the user experiences. It is a reason to keep **one Mate request/context/persistence core** with multiple experiences.

### 5. Places/Planner is a multi-module feature family — MEDIUM

`nearby.js`, `app.js`, `place-auto-fill.js`, `auto-planner.js`, `smart-plan-tools.js`, `lodging-manager.js`, and `place-directions.js` share events and DOM contracts.

The responsibilities are mostly distinct, so wholesale merging is not recommended. The duplication is primarily in **state access, geocoding/media utilities, event contracts, and persistence**.

**Target:** common Place/Trip service APIs, while keeping feature-specific UI modules.

## Shared event architecture

Multiple emitters currently exist for:

- `travelmate:ask-ai`
- `travelmate:activities-updated`
- `travelmate:places-updated`

This is workable, but event payload contracts should be documented before feature consolidation so consumers do not depend on emitter-specific details.

Repeated view navigation did not create duplicate DOM feature shells in the tested cycle.

## Network/provider duplication

The same external providers are implemented independently in multiple modules:

- Nominatim: app, lodging, Nearby, place auto-fill, transport, travel services, getaway fix.
- Overpass: Nearby, place auto-fill, travel services, getaway fix.
- Wikimedia/Wikidata: destination images, lodging, Nearby, place auto-fill.
- Unsplash fallback imagery: destination images, Home, lodging, place auto-fill.

**Target:** shared provider adapters with common timeout, URL validation, cache and failure semantics. Do not merge exact-POI imagery with destination-level decorative imagery.

## Runtime loading architecture

No duplicate asset requests were observed, so the existing loader cache works.

However, Overview still eventually loads feature code unrelated to the active view, including Transport, Collaboration, Travel Services, Place Directions, Trip Experience, About, and the AI experiences.

Cold Overview measurement:

- 50 local asset requests
- 24 JavaScript
- 26 CSS
- ~1.1 MB transferred in the local static runtime

**Target:** after stability work, narrow `structureScripts` / `structureStyles` and idle warmers so only global capabilities load globally. Keep user-perceived availability while reducing listeners and startup surface area.

## CSS ownership

Current intended ownership:

1. `theme.css` — semantic tokens and theme state.
2. `trip-redesign.css` — trip structure/layout.
3. Component CSS — component geometry/feature-specific behavior.
4. `readable-glass.css` — final material/contrast authority.

Current debt:

- Total `!important`: 2,379
- `theme.css`: 1,547
- `readable-glass.css`: 358
- `cloud-sync.css`: 106
- `trip-redesign.css`: 79
- `weather-contrast.css`: 75

Examples of selectors with multiple visual owners include:

- `.mobile-header`
- `.generated-day`
- `.planned-activity`
- `.saved-place`
- `.weather-top-widget`
- `.ai-panel`
- `.transport-card`
- `.service-card`
- `.group-card`
- `.memory-card`
- `.doc-row`
- modal surfaces

### CSS consolidation candidates

- `weather-contrast.css`: MERGE LATER into the Weather component + final semantic material layer.
- `activity-contrast.css`: intentionally empty compatibility file; REMOVE LATER after loader/test references are updated.
- `styles.css`: legacy/base monolith; shrink gradually, do not delete in one pass.
- `theme.css` and `readable-glass.css`: keep as authorities but reduce override debt during Codex visual consolidation.

The already-retired `place-auto-fill-v2.css` and four old contrast layers were removed before this audit; do not reintroduce them.

## Static trip entry points

`trip/italy-2028/index.html` (~40 KB) and `trip/japan-2027/index.html` (~54 KB) contain large static trip markup, while the canonical custom trip shell is ~9 KB.

Treat Italy/Japan as fixtures/reference trips, not a second product architecture.

**Target:** keep them for regression/reference until the custom-trip engine fully covers their required scenarios; then decide whether to convert them into fixture data rather than maintain parallel page implementations.

## Global namespace finding

Only one direct multi-file global assignment collision was found:

`window.travelMateSupabaseLoader` → `cloud-sync.js` and `document-vault.js`.

Other `window.TravelMate*` exports are currently distinct.

## Dead/unreferenced assets

The static reference scan found no obvious unreferenced JS/CSS assets in the current tree.

This does **not** mean every code path is live. Files such as `getaway-fix.js` may be referenced yet still represent superseding patch layers.

## KEEP / MERGE / REMOVE matrix

### KEEP

- cloud-sync
- custom-trip
- nearby
- auto-planner
- place-auto-fill
- lodging-manager
- place-directions
- transport-planner
- document-vault
- collaboration
- ai-assistant
- trip-intelligence as an experience
- smart-hub as an experience
- weather-widget
- theme/language/navigation/security core

### MERGE LATER

- Getaways corrective logic → travel-services — **DONE**
- direct trip persistence → canonical Trip Store — **DONE**
- Supabase loader → one core loader — **DONE**
- duplicated Nominatim/Overpass/Wikimedia helpers → provider adapters
- common Mate request/context/persistence plumbing → one AI core
- CSS material overrides → explicit final owners
- `trip-experience.js` into smaller Budget/Memories/Currency modules if split can preserve behavior

### REMOVE LATER

- `getaway-fix.js` after merge
- `activity-contrast.css` after references/contract update
- obsolete legacy declarations left in `styles.css` after ownership migration
- static trip-page duplication only after fixtures are represented safely elsewhere

### DO NOT REMOVE

- internal `TravelMateNavo` API name until an explicit compatibility migration exists
- current event names without an event-contract migration
- static Italy/Japan fixtures before replacement regression fixtures exist
- final readable-glass authority before Codex establishes a replacement cascade

## Pre-Codex order of work

1. ~~Fix the shared Supabase loader ownership.~~ **DONE**
2. ~~Consolidate Getaways implementation and remove the patch file.~~ **DONE**
3. ~~Define a Trip Store facade and migrate the highest-risk full-array writers first.~~ **DONE — expanded to all direct feature readers/writers.**
4. Document event payload contracts for places/activities/AI.
5. Tighten the global feature loader without changing user-visible behavior.
6. Run the full runtime/contract/PWA regression.
7. Hand Codex the visual ownership map and prohibit expansion of components marked for later removal.

## Codex guardrails

Codex should:

- preserve `preview` behavior and existing data formats;
- not touch `main`;
- not deploy Supabase Production changes;
- not introduce another visual override layer;
- not expand `getaway-fix.js`, `activity-contrast.css`, or other components marked for later removal;
- prefer removing conflicting ownership over adding new `!important`;
- preserve internal compatibility identifiers unless a tested migration is part of the same change;
- run contract tests and runtime checks after each ownership consolidation.
