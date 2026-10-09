# TravelMate iOS Live Today Widget — 2.21.0

Status: Draft native P2 work on `chatgpt/ios-live-today-widget`, layered on the green iOS Budget Widget branch. Do not merge to `preview` or `main` until later native device gates are complete.

## Architecture

- Budget and Live Today are two WidgetKit kinds in the same `TravelMateBudgetWidget.appex` extension.
- Both reuse App Group `group.com.travelmate.app` and the same bounded, privacy-redacted native snapshot.
- The web snapshot remains the source of truth for `done`, `flexible`, `window` and fixed/planned filtering via the canonical Today model.
- No new store, network request, GPS, AI call, Health data, documents, notes or private message payloads are introduced.

## Live Today contract

- In the integrated release candidate, render the `liveToday` state/time selected by `TravelMateToday.currentOrNext`. Native code does not sort agenda items or select a successor. Once `validUntilEpochMs` expires, show update-needed until a fresh canonical snapshot arrives. See `native-widget-snapshot.md` for the additive v1 contract.
- If there is no fixed/planned commitment, render the canonical trip phase fallback instead of promoting flexible/window content.
- Show cached Weather only while the sanitized weather snapshot is ready and fresh.
- Show unread collaborative changes only as a bounded count.
- Root/open-plan action uses `travelmate://trip/<id>?view=plan`.
- Unread action uses `travelmate://trip/<id>?view=overview&panel=changes`.
- Default home-screen content remains privacy-redacted and explicitly stale when the snapshot expires.
- Timeline refresh is OS-managed; TravelMate does not promise minute-exact background updates.

## Release gate

The macOS workflow must pass from committed source:
1. npm/native sync and full Node regressions;
2. shared WidgetKit target contains Budget and Live Today source files;
3. app + shared `.appex` compile for iOS Simulator;
4. package verification confirms the existing widget bundle and staged runtime;
5. simulator `.app` artifact upload;
6. bridge reloads both WidgetKit kinds after snapshot update/clear.

Simulator success proves compile/package integrity only. Real iPhone provisioning, App Group capability activation, add/remove/resize, deep links, offline/account-switch behavior and VoiceOver/RTL remain explicit later device gates.
