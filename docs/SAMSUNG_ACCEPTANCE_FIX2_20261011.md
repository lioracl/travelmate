# Samsung acceptance fix 2 — 2026-10-11

Baseline b757753168122a5452a869255c519250b8132471; previous artifact 11676321088 is superseded by this code change.

- app-shell.css binds public landing-nav to existing SystemBars insets, reserves scrollable carousel geometry for short displays and preserves neutral system-bar colors.
- home-organizer.css gives the existing login control a 44px minimum touch target.
- trip-change-notifications.css gives launcher/badge hidden attributes precedence without adding important declarations.
- trip-change-notifications.js rejects stale solo/non-member launcher activation and clears badges on session reset; existing shared/offline refresh behavior remains.
- plan-ux-polish.js avoids adding a second ratings link when the saved-place renderer already supplies it.
- app.js preserves the mobile-trip-back styling class during initialization and translates known stored place categories for display only. Stored category values and Back routing are unchanged.
- About and page/SW asset references advance to 20261011-01; version remains 2.21.0 / 22100.

Focused browser tests: 15 new cases, covering public 360/390/430 light/dark, login modal, neutral bar contrast, short 568px viewport/scroll ending, authenticated cached home, solo/shared/zero/nonzero notifications, account/logout/reconnect, canonical reviews, category display/storage and final Back class/50px geometry. Together with existing shell and Weather/notification tests: 36 PASS. Node: 912 PASS. Full browser and exact-SHA native CI evidence is recorded in the final handoff.

Device-confirmed baseline passes preserved: scenic icon/AI, authenticated trip top safe area, bottom spacing, Hebrew Places wrapping, Mate keyboard, Overview/Hero/Weather and Budget/unlimited semantics. No icon/Hero/Weather asset or material edits in this pass.

Samsung retest: public landing/login/carousel; solo no bell; shared bell/panel; zero hidden and positive badge; one reviews action; Hebrew categories; Back appearance and behavior; retained trips/data; unchanged Hero/Weather. This document does not claim new physical acceptance. PR stays draft/unmerged, main untouched, no preview deployment.
