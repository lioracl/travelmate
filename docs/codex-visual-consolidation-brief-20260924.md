# TravelMate Codex Visual Consolidation Readiness Brief

Date: 2026-09-24  
Target branch: `preview`  
Baseline commit: **resolve the current `preview` HEAD immediately before the Codex session**  
Release baseline: TravelMate `1.55.9`  
PWA baseline: `travelmate-smart-v197`  
Asset baseline: `20260924-12`

## Mission

Perform a **final visual and UX consolidation pass** across TravelMate without changing the product architecture, data model, cloud behavior, or feature semantics.

The repository has already completed the structural pre-Codex cleanup. Do not reopen or redesign the solved architecture. The goal now is to make the application look and behave like one coherent product on mobile and desktop, in light and dark themes, while reducing CSS ownership conflicts rather than adding another override layer.

## Hard safety constraints

- Work on a dedicated branch from `preview`.
- Do not touch `main`.
- Do not modify Supabase Production data, RLS policies, database schema, Edge Functions, secrets, or deployed production configuration.
- Do not change the existing trip JSON schema unless the change is explicitly required and fully migration-safe.
- Preserve the internal compatibility API name `window.TravelMateNavo`; the visible product brand is **Mate**.
- Preserve current event names and their normalized payload contracts.
- Preserve `TravelMateTripStore` as the only feature-facing persistence facade.
- Do not reintroduce direct feature access to `travelmate-trips`.
- Do not reintroduce retired files:
  - `getaway-fix.js`
  - `weather-contrast.css`
  - `activity-contrast.css`
  - `place-auto-fill-v2.css`
- Do not create a new global “fix”, “contrast”, or “override” stylesheet.
- Prefer removing conflicting declarations over adding new `!important`.
- Do not hide overflow as a substitute for fixing layout.
- Do not weaken accessibility to match a screenshot.
- Do not remove the keyboard skip link. It must remain visually hidden until keyboard focus.
- Keep Italy/Japan pages as regression fixtures; do not redesign them into a second product architecture.

## Current product information architecture — do not undo

The primary trip navigation is intentionally limited to **five core areas**:

1. Overview
2. Plan
3. Places
4. Budget
5. Documents

The Places area is a parent experience with four subviews:

- Places
- Transport
- Getaways / outside the city
- Destination information

These remain separate lazy-loaded feature engines. The consolidation is UX/navigation only; do not merge them into one monolithic script.

Group/Sharing, Memories and About are secondary tools under the trip **More** menu. They must not be reintroduced as permanent primary sidebar tabs.

Legacy deep links such as `?view=transport`, `?view=getaways`, `?view=destination-info` and `?view=car-rental` remain compatibility routes. The main Places tab must stay active for the Places-family subviews.

Documents V2 is now canonical:
- primary filters are All / Flights / Lodging / Tickets & Transport / Insurance / Personal / Mate;
- legacy categories are normalized in the UI without a database migration;
- encrypted vault documents and Mate notes remain separate storage/security domains;
- one encrypted document must render under exactly one category owner;
- do not send encrypted document contents to Mate automatically;
- the single header upload action and category upload actions share the same secure vault flow.

Budget V2 is now product-critical:
- explicit limited and unlimited budget modes;
- unlimited mode must never show remaining budget, over-budget state or utilization percentage;
- smart summary shows spent-to-date, today, daily average, category/allowance context and trip projection;
- the currency converter sits directly below the smart summary;
- Overview has a direct lazy-loaded quick action to the converter.

## Current architecture — treat as canonical

### Core state / persistence
- `assets/cloud-sync.js` — canonical cloud/auth/sync layer.
- `assets/trip-store.js` — canonical feature-facing trip state API:
  - `getTrips()`
  - `getTrip()`
  - `saveTrip()`
  - `updateTrip()`
  - `removeTrip()`
- Only `cloud-sync.js` and `trip-store.js` own the literal `travelmate-trips` storage key.

### Event contracts
- `assets/event-contracts.js` owns the normalized event contracts.
- Important events include:
  - `travelmate:viewchange`
  - `travelmate:places-updated`
  - `travelmate:activities-updated`
  - `travelmate:ask-ai`
  - `travelmate:feature-ready`
- Do not replace normalized emitters with raw ad-hoc `CustomEvent` payloads.

### Feature loading
- `assets/app.js` owns dynamic feature loading.
- Heavy features are lazy-loaded by view.
- Nearby and Document Vault are view-scoped rather than globally loaded.
- Transport / Getaways / Group / Memories / About are not global structure assets.
- Preserve the lazy-loader behavior and its no-duplicate loading guarantees.

### Visual ownership
Intended CSS ownership order:
1. `theme.css` — semantic tokens and theme state.
2. `trip-redesign.css` — trip structure and layout.
3. Feature CSS — component-specific geometry and interaction.
4. `readable-glass.css` — final material / contrast authority.

Do not create a fifth authority layer.

## Structural cleanup already completed

The following work is **DONE** and must not be reimplemented:

- Supabase CDN/library loading consolidated to the Cloud core.
- Supabase failed-script retry path fixed.
- Getaways duplicate implementation consolidated into `travel-services.js`.
- `getaway-fix.js` removed.
- Trip Store introduced and all feature readers/writers migrated away from direct `travelmate-trips` access.
- Event payload contracts centralized.
- Heavy global feature loading narrowed.
- Nearby and Document Vault lazy-loaded by their owning views.
- Weather contrast consolidated into `weather-widget.css`.
- `weather-contrast.css` removed.
- Empty `activity-contrast.css` removed.
- Document Vault desktop auth-grid overflow fixed without clipping content.
- Visible Navo/נבו branding migrated to **Mate** while internal `TravelMateNavo` compatibility remains.
- Skip link focus bug fixed.
- Places/Planner image pipeline fixed, including empty URL handling and saved-place backfill.
- PWA versioning and offline cache update path hardened.
- Primary trip navigation consolidated to five core areas; Transport/Getaways/Destination Info are now Places subviews, while Group/Memories/About are secondary tools.
- Duplicate legacy sidebar active-state ownership removed; `trip-redesign.js` is the canonical trip navigation state owner.
- Budget V2 core added, including unlimited tracking, smart spend summary and direct Overview access to the currency converter.

## Current visual debt

The code is structurally much tighter, but the application still has a large CSS override history.

Current known `!important` debt remains approximately 2,379 rules. This number is a debt ceiling, not a target to eliminate mechanically.

Largest historical ownership areas include:
- `theme.css`
- `readable-glass.css`
- `cloud-sync.css`
- `trip-redesign.css`
- component-specific legacy selectors

The visual pass should reduce conflict where it touches components, but must not chase a numeric target at the cost of regressions.

## Priority visual problems from real-phone evidence

### 1. Glass clarity and boundaries
Observed issue:
- Some glass cards are too translucent.
- Card boundaries can disappear over bright hero imagery.
- Text sometimes sits over insufficiently separated material.
- Nested surfaces can visually merge into the parent.

Target:
- Clear, consistent card edge.
- Readable material at all times.
- Strong separation between primary card, nested surface and control.
- Preserve the “glass” character without sacrificing contrast.

### 2. White / low-contrast controls
Observed issue:
- Some buttons and icon controls can look white-on-white or too pale.
- Secondary/ghost controls are not always visually distinct from the card background.
- Destructive actions must remain clearly distinct.

Target:
- Primary, secondary, ghost, icon and danger controls must each have one semantic visual contract.
- Use central tokens.
- Avoid per-feature ad-hoc white backgrounds.
- Preserve accessible focus states.

### 3. Card consistency
Weather on Overview is the historical visual reference.

Target:
- Cards across Overview, Planner, Places, Documents, Budget, Transport, Getaways, Group and Memories should share:
  - radius language
  - border strength
  - surface hierarchy
  - heading hierarchy
  - spacing rhythm
  - control treatment
  - icon container treatment
- Do not make every card identical in layout; make them clearly part of the same design system.

### 4. Planner density and hierarchy
Current Planner functionality is strong, but visual hierarchy still feels more “assembled” than final.

Target:
- Clear distinction between:
  - day container
  - activity row
  - saved place
  - lodging/airport anchors
  - day note
  - action controls
- Keep the current functional behavior and chronological logic.
- Improve mobile scanability at 390px.
- Avoid increasing vertical bulk unnecessarily.

### 5. Places
Preserve:
- GPS consent
- exact location accuracy warning
- categories
- map
- Search this area
- list/map sync
- selected-place sheet
- official site / Wikipedia / directions
- Add to Places / Plan
- image resolver/backfill

Target:
- Result cards must have a clear image/fallback region.
- No empty white media rectangle.
- Image fallback should look intentional.
- Action buttons must be readable and touch-friendly.
- Hebrew / RTL layout must remain correct.

### 6. Documents
The desktop overflow bug is already fixed.

Target:
- Preserve the fixed responsive auth grid.
- Improve visual distinction among:
  - authentication area
  - upload area
  - document categories
  - encrypted preview
- Do not make actual document paper/canvas dark just to satisfy dark theme.
- Keep document UI semantic while allowing real paper/PDF content to remain white.

### 7. Mate
Visible brand = **Mate**.

Target:
- Mate orb, sheet/dialog, assistant bubble, user bubble and action buttons must be theme-safe.
- Remove any remaining weak-contrast state.
- Keep the internal `TravelMateNavo` identifier unchanged.
- Keep saved-note duplicate prevention behavior.
- Keep focus trap and focus restore behavior.

### 8. Mobile chrome
Target:
- No giant visible skip-link at startup.
- Header controls fit at 390px.
- Menu/back controls have reliable 44px-class touch targets.
- No horizontal page overflow.
- Respect safe-area insets.
- Do not permanently show keyboard-only accessibility UI.

## Feature duplication guardrails

Do not merge user experiences simply because they share infrastructure.

Keep distinct:
- Nearby discovery
- Place Auto Fill
- Daily Planner
- Smart Plan tools
- Lodging manager
- Place directions/share
- Transport planner
- Mate conversation
- Trip Intelligence
- Smart Hub

Shared infrastructure may be consolidated only when behavior is preserved:
- trip persistence
- event contracts
- provider/network helpers
- AI request/context plumbing
- visual tokens/material rules

## AI ownership

Treat:
- `ai-assistant.js` as the Mate conversation core.
- `trip-intelligence.js` as a proactive recommendation experience.
- `smart-hub.js` as a smart-tools experience.

Do not collapse all three into one UI.

If visual work touches these components, reuse one consistent Mate visual vocabulary.

## Static trip fixtures

`trip/italy-2028/` and `trip/japan-2027/` are regression/reference fixtures.

During this pass:
- keep them functional;
- keep their accessibility contracts;
- verify shared CSS does not regress them;
- do not invest in separate visual architecture for them.

## Required execution order

### Phase 1 — evidence first
Before changing CSS:
1. Run the current contract tests.
2. Capture baseline screenshots at:
   - 390×844 light
   - 390×844 dark
   - 1280×900 light
   - 1280×900 dark
3. Capture at minimum:
   - Overview
   - Plan
   - Places
   - Documents
   - Budget
   - Transport
   - Group
   - Memories
4. Record selectors responsible for each visible issue.

### Phase 2 — define ownership
For each selector being changed:
- identify the current owners;
- select one canonical owner;
- remove or reduce the competing declarations;
- do not add a new patch file.

### Phase 3 — component consolidation
Recommended order:
1. global buttons / icon controls
2. card material / boundaries
3. nested surfaces
4. headers / section titles
5. Planner
6. Places
7. Documents
8. Budget / Memories
9. Transport / Getaways / Group
10. Mate / recommendation surfaces
11. final Light/Dark and RTL pass

### Phase 4 — regression
Run:
- all Node contract tests;
- all JS syntax checks;
- mobile/desktop × light/dark runtime matrix;
- direct URL entry to every view;
- in-app lazy-navigation paths;
- repeated view navigation to detect duplicate initialization;
- PWA service worker update;
- offline reload;
- saved-trip reload;
- Mate note persistence;
- Places/Planner persistence;
- visual screenshots.

## Acceptance criteria

The visual pass is complete only when all of the following are true:

### Runtime
- No page errors.
- No broken local assets.
- No duplicate feature scripts or styles.
- No horizontal overflow at 390px or 1280px in tested views.
- Direct URL view loading works.
- Lazy navigation loads the owning feature on demand.

### PWA
- New asset version and cache name are bumped.
- Existing installed PWA upgrades without deleting user data.
- Offline reload works after cache priming.
- Old `travelmate-smart-vN` caches are cleaned.

### Persistence
- Planner edit survives reload.
- Saved Places survive reload.
- Lodging survives reload.
- Mate saved note survives reload.
- Unrelated trip fields are preserved during feature updates.
- No feature reintroduces direct `travelmate-trips` access.

### Branding
- No visible “נבו”, “Navo” or “Nevo”.
- Visible assistant name is **Mate**.
- Internal `TravelMateNavo` remains unless a separate compatibility migration is explicitly approved.

### Accessibility
- Skip link hidden until keyboard focus.
- Visible focus state on interactive controls.
- Modal/dialog focus traps remain functional.
- Dialog opener focus restores on close.
- Icon-only controls have accessible names.
- Touch targets remain usable on mobile.
- RTL remains correct.

### Visual
- No white-on-white controls.
- No unreadable text over glass.
- Card boundaries remain clear over hero imagery.
- Primary/secondary/ghost/danger control hierarchy is consistent.
- Weather visual treatment remains intact.
- Document paper/PDF content remains natural while app chrome follows theme.
- Places image fallback is intentional rather than blank.

## Known baseline evidence

As of the baseline:
- JS syntax checks pass.
- GitHub Actions for the preceding cleanup PRs pass.
- 44-case runtime matrix passed after CSS ownership cleanup.
- Weather A/B computed styles were identical before/after contrast-file consolidation.
- Documents desktop width improved from `scrollWidth 1317` to `1280` at a 1280px viewport.
- Final live deployment serves:
  - TravelMate `1.55.5`
  - `travelmate-smart-v193`
  - assets `20260924-08`
- Final live 44-case matrix passed with zero failures.
- Save/Reload preserved Planner activity, Lodging and Mate note while preserving an unrelated trip field.
- Offline reload passed on the live GitHub Pages deployment.

## Output required from Codex

At the end, return:

1. Branch and HEAD.
2. Exact files changed.
3. CSS owners removed or consolidated.
4. `!important` count before and after.
5. Screenshots created.
6. Contract-test result summary.
7. Runtime matrix result.
8. PWA/offline result.
9. Any issue intentionally left unchanged and why.
10. Explicit statements:
   - `main` untouched.
   - Supabase Production untouched.
   - existing trip data format preserved.
   - internal `TravelMateNavo` compatibility preserved.
   - retired patch layers were not reintroduced.
