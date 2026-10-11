# TravelMate 2.21.0 — iOS Notifications Widget

The standalone collaborative Notifications widget is a fourth WidgetKit kind inside the existing `TravelMateBudgetWidget.appex` extension.

## Data contract
- Reuses App Group `group.com.travelmate.app` and the existing schema-1 privacy-redacted snapshot.
- Reads only `accountId`, `tripId`, snapshot expiry and bounded `unreadChanges`.
- `unreadChanges` is clamped to `0…999` before WidgetKit receives it.
- No event body, summary, actor name, documents, Health data, private notes or message content is exposed.
- The widget owns no network, Realtime, Supabase, GPS or second notification store.

## UX
- Zero unread: clear “all up to date” state.
- Unread: bounded unread count, rendered as `99+` above 99.
- Expired snapshot: cached/stale wording explicitly asks the user to open TravelMate to refresh.
- Root tap opens the existing changes center: `travelmate://trip/<id>?view=overview&panel=changes`.
- RTL, accessibility labels and privacy-sensitive rendering are required.
- Timeline refresh is OS-managed; no minute-exact background promise.

## Release gate
The macOS CI lane must pass from committed source: focused + full Node regressions, native sync, Xcode Simulator build, one packaged `.appex` containing Budget + Live Today + Weather + Notifications, package/version checks and artifact upload.

Keep the branch and PR in Draft until real-iPhone provisioning, App Group activation, add/remove/resize, deep-link, account-switch/logout, offline and VoiceOver/RTL gates are completed.
