# TravelMate CSS Ownership — 2026-09-27

## Current authority map
- `styles.css` — reset, base primitives, shared non-feature defaults. Target: 0 `!important`.
- `trip-redesign.css` — layout and geometry only: responsive frame, navigation geometry, screen structure.
- `theme.css` — semantic design tokens and theme/accent variants; no feature-specific visual ownership.
- `readable-glass.css` — final shared material/surface authority and compatibility bridge.
- Feature stylesheets — feature-specific controls and content; they should consume semantic tokens.

## Locked core screens
- Custom Overview owns its local material and bypasses the generic theme material boundary.
- Custom Plan owns its local day/activity hierarchy and bypasses the generic theme material boundary.
- Custom Documents owns its category/file row hierarchy in `document-vault.css` and bypasses the generic theme material boundary.
- Mobile drawer geometry belongs to `trip-redesign.css`; drawer material belongs to `readable-glass.css`.
- Weather material belongs to `weather-widget.css` plus shared semantic tokens.
- All Trips visual structure belongs to `home-organizer.css`.

## Debt after this stage
- Total CSS `!important`: 286.
- `readable-glass.css`: 105.
- `document-vault.css`: 5 (down from 14 before Documents ownership).
- Core ownership debt ceiling: 210.
- No new `!important` was added during the Documents ownership stage.

## Next safe migration targets
1. Mate: reduce assistant/smart-hub cross-ownership before changing visuals.
2. Places: fix duplicate multilingual place identity and nested interactive semantics.
3. Transport: remove duplicated shared-surface overrides.
4. Remaining shared legacy boundary: retire selectors only after each feature has explicit semantic ownership.
