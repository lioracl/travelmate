# TravelMate iOS Weather Widget — 2.21.0

Status: Draft native P2 work on `chatgpt/ios-weather-widget`, layered on the green iOS Live Today Widget branch. Do not merge to `preview` or `main` until later native device gates are complete.

## Architecture

- Weather is the third WidgetKit kind inside the existing `TravelMateBudgetWidget.appex` extension.
- Budget, Live Today and Weather all reuse App Group `group.com.travelmate.app` and the same bounded privacy-redacted native snapshot.
- No new extension target, entitlement, store, network client, GPS flow, AI call, Health data, document/note content or private message payload is introduced.
- The approved in-app Weather/Hero architecture remains unchanged.

## Weather contract

- The widget renders only the current temperature and concise condition label already published by the canonical `TravelMateWeatherContext` through `assets/native-widget-snapshot.js`.
- Freshness is snapshot-observation freshness, not proof of a provider fetch at render time.
- Fresh cached data is shown normally.
- Expired cached data may remain visible offline but must be explicitly labelled as saved/stale.
- Missing temperature remains missing (`—`), never fake `0°`.
- Missing/invalid Weather renders an explicit unavailable state.
- Root tap opens the existing trip Overview via `travelmate://trip/<id>?view=overview`; no new `view=weather` navigation owner is created.
- Supported families: small and medium. RTL, accessibility labelling and privacy-sensitive rendering remain mandatory.
- Timeline refresh is OS-managed and is not promised at minute precision.

## Release gate

The macOS Weather workflow must pass from committed source:
1. npm/native sync and focused/full Node regressions;
2. shared WidgetKit target contains Budget, Live Today and Weather source files;
3. app + the single shared `.appex` compile for iOS Simulator;
4. package/version/runtime verification succeeds;
5. simulator `.app` artifact is uploaded;
6. bridge reloads all three WidgetKit kinds on snapshot update/clear.

Simulator success proves compile/package integrity only. Real iPhone provisioning, App Group activation, widget add/remove/resize, offline/account-switch behavior, Overview deep link and VoiceOver/RTL remain explicit later device gates.
