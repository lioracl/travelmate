# TravelMate Native Widget Snapshot — Contract v1

Status: isolated widget foundation on the native/widget draft branch; not published to `preview` or `main`.

## Ownership and lifecycle

`assets/native-widget-snapshot.js` is the single browser-side snapshot builder. It consumes the existing `TravelMateToday` model/agenda, `TravelMateWeatherContext` and `TravelMateTripChangeContext`. It does not query GPS, fetch weather, request AI, read documents or introduce a second trip store.

`tools/stage-native-web.mjs` injects the widget script **only into the staged native** Home and trip HTML. The published PWA HTML and service-worker cache contract remain unchanged. The Java Capacitor bridge is named `TravelMateWidgetBridge` and exposes `updateSnapshot({snapshot})` and `clearSnapshot()`.

The snapshot is refreshed on canonical activity/place/Today/weather/change events and on focus/online, with short coalescing. The native bridge writes are serialized. Sign-out, account-context change and trip deletion clear the native snapshot. A snapshot is published only if the current authenticated account can find the same trip/owner in the canonical account-scoped cached trip list. Home preserves the last authorized widget until sign-out or account switch.

## Schema v1

- `schemaVersion`: integer `1`; unknown versions must be rejected by native consumers.
- `accountId`, `tripOwnerId`, `tripId`: internal account/trip scope, never user-visible; trip IDs are validated before generating links.
- `privacyMode`: `redacted` by default for lock-screen safety. The `standard` builder option is not exposed to users and must not be enabled without a deliberate privacy preference.
- `destination`: blank in redacted mode; `destinationTimeZone`: validated IANA name only when supplied; `clockBasis`: `device-local`. **Do not label times as destination-local** until the trip has a verified canonical timezone and the date conversion is implemented.
- `phase`, `today`, `dayIndex`, `tripDays`: derived from `TravelMateToday.model`.
- `agenda`: at most eight upcoming fixed/planned entries in a 36-hour device-local window. Excludes completed, flexible and window entries; uses canonical Today timing-mode normalization. Each item has `id`, `kind`, `time`, ISO `startAt/endAt`, epoch milliseconds and empty `title/location` in redacted mode.
- `liveToday`: canonical `TravelMateToday.currentOrNext` state/time and `validUntilEpochMs`. This additive v1 field contains no titles or location. The browser checks canonical minute boundaries through snapshot expiry (at most 30 minutes), including midnight, and expires the selection at the first change. Missing owner/legacy selection fails closed.
- `weather`: `ready`, `label`, nullable `temperatureC`, `validUntil` and `validUntilEpochMs`. Weather expires 30 minutes after a ready weather-context event observed by the runtime; a stale/unknown observation is not marked ready. This is an **observation timestamp**, not proof of a fresh provider fetch.
- `unreadChanges`: sanitized integer 0–999 from the existing collaborative-change context, never notification message contents.
- `updatedAt`, `updatedAtEpochMs`, `expiresAt`, `expiresAtEpochMs`: generated snapshot time and 30-minute expiration.
- `deepLinks`: strictly `travelmate://trip/{id}` with whitelisted views and optional `panel=changes` for Overview. Native consumers must still rely on app authentication/authorization before exposing trip content.

The payload **must never** contain documents, passwords, notes, receipts, health records, GPS history, private messages, arbitrary event bodies or unapproved learned preferences. Account IDs and trip IDs remain internal to the private native store.

## Android Budget Widget

The Budget Widget is a read-only native rendering of canonical Budget V2 data. It shows spent-so-far, limited-budget remaining/overrun or unlimited-budget daily pace, plus cached FX freshness. `+ Expense` and `Converter` only deep-link to the existing Budget V2 UI. Native code never writes an expense or fetches an exchange rate itself.

## Android Live Today Widget

`TravelMateLiveTodayWidgetProvider` reuses the **same** account/trip-scoped snapshot as the Budget Widget. It does not create another store, scheduler or network path.

- Android and iOS render only `liveToday`; neither selects or sorts raw agenda items. The bounded agenda remains informational/backward compatible. Missing durations remain zero; no 60-minute duration is invented.
- Native renders the canonical **current**/**next** label only before its validity boundary. Expired/missing selection shows the cached/update-needed state until the app refreshes. OS-managed widget refresh is not minute-exact.
- With no fixed candidate, the sanitized `phase` drives the fallback: before trip, active/open-and-flexible, after trip or unknown/update-needed.
- Default privacy remains `redacted`, so the home-screen widget shows timing/state only and does not expose activity title or location. Exposing those fields later requires an explicit user privacy preference and separate review.
- Weather is rendered only when the existing snapshot says it is ready and its `validUntilEpochMs` is still in the future. No widget-side weather request is allowed.
- Unread collaborative changes are a count only. Tapping the count deep-links to Overview `panel=changes`; tapping the widget or `Open Plan` deep-links to Plan.
- Android refresh remains OS-managed (`updatePeriodMillis=1800000`) plus in-app refresh when the canonical bridge receives a new snapshot. There is no promise of minute-exact background updates.
- The layout is RTL-aware and uses the same widget material/background tokens as Budget. Real-device accessibility, add/remove/resize, account switch, offline and deep-link smoke remain part of the Draft runtime gate.

## Tests and integration gates

Focused contract tests:
- `node --test tests/native-widget-snapshot-contract.test.js`
- `node --test tests/budget-widget-contract.test.js`
- `node --test tests/live-today-widget-contract.test.js`

They cover scope validation, redaction, bounded payloads, canonical timing-mode filtering, malformed dates/times, weather staleness/null temperature, IANA validation, deep-link sanitization, account switch/sign-out, native-only staging, Budget ownership and Live Today native wiring.

Native stage: `npm.cmd run native:stage` on Windows; verify both `dist/index.html` and `dist/trip/custom/index.html` include the bridge script, while original PWA files do not.

**Android runtime gate:** keep PR #146 Draft until an emulator or real Android device verifies startup/login/trip loading, add/remove/resize for both widgets, Quick Expense, converter, Plan/changes deep links, stale/offline behavior, account switch/logout clearing, RTL/accessibility and packaged WebView behavior.

**iOS integrated:** Budget, Live Today, Weather and Notifications share one WidgetKit extension and App Group. All four kinds reload on snapshot updates/clears. macOS Simulator CI validates packaging; physical-device gates remain outstanding.
