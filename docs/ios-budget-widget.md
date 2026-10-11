# TravelMate iOS Budget Widget — 2.21.0

Status: Draft native P2 work on `chatgpt/ios-budget-widget`, based on the green `chatgpt/ios-foundation` branch. Do not merge to `preview` or `main` until simulator WidgetKit QA is green from the committed Xcode target and real-device signing/App Group validation is performed later.

## Product contract

The iOS Budget Widget is the first TravelMate WidgetKit surface. It reuses the existing native widget snapshot and Budget V2 flows; it must not create a second budget store or currency-rate engine.

It may display only the bounded, redacted widget snapshot:
- spent amount in trip currency;
- remaining or overrun for limited budgets;
- daily spending pace for unlimited budgets;
- cached FX state with explicit fresh / stale / unavailable handling;
- quick-expense and converter deep links back into the existing TravelMate Budget UI.

## Privacy and storage

- Shared container: `group.com.travelmate.app`.
- App and widget extension receive the same App Group entitlement.
- Widget data remains `privacyMode=redacted`, account/trip scoped, bounded and cleared by the existing native snapshot lifecycle on sign-out, account change or trip invalidation.
- Never store documents, notes, receipts, Health data, GPS history, private messages or arbitrary collaboration payloads in the App Group.
- The widget performs no direct network request.

## Refresh and offline behavior

WidgetKit renders from the last accepted local snapshot. Timeline refresh is OS-managed and is not promised at minute precision. Stale or unavailable data must remain explicit rather than being converted into fake zero values.

## Deep links

- Budget surface: `travelmate://trip/<tripId>?view=budget`
- Quick Expense: `travelmate://trip/<tripId>?view=budget&action=quick-expense`
- Converter: `travelmate://trip/<tripId>?view=budget&action=converter`

All actions open existing TravelMate flows. No native expense writer is introduced.

## Release gate

The macOS WidgetKit workflow must validate from committed source:
1. `npm ci` and native staging/sync;
2. widget contract and full Node regression;
3. app + WidgetKit extension compile for Simulator;
4. `App.app/PlugIns/TravelMateBudgetWidget.appex` exists;
5. app/extension version and bundle identifiers are correct;
6. App Group entitlements are present;
7. the Simulator artifact is uploaded.

Passing Simulator QA proves compile/package integrity only. Real iPhone provisioning, App Group entitlement activation, widget add/remove/resize, Quick Expense/Converter deep links, offline/account-switch behavior and RTL/accessibility remain explicit later device gates.
