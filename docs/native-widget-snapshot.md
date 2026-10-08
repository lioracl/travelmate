# TravelMate Native Widget Snapshot — Contract v1

Status: isolated widget foundation on `chatgpt/widget-foundation`; not published to `preview` or `main`.

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
- `weather`: `ready`, `label`, nullable `temperatureC`, `validUntil` and `validUntilEpochMs`. Weather expires 30 minutes after a ready weather-context event observed by the runtime; a stale/unknown observation is not marked ready. This is an **observation timestamp**, not proof of a fresh provider fetch.
- `unreadChanges`: sanitized integer 0–999 from the existing collaborative-change context, never notification message contents.
- `updatedAt`, `updatedAtEpochMs`, `expiresAt`, `expiresAtEpochMs`: generated snapshot time and 30-minute expiration.
- `deepLinks`: strictly `travelmate://trip/{id}` with whitelisted views and optional `panel=changes` for Overview. Native consumers must still rely on app authentication/authorization before exposing trip content.

The payload **must never** contain documents, passwords, notes, receipts, health records, GPS history, private messages, arbitrary event bodies or unapproved learned preferences. Account IDs and trip IDs remain internal to the private native store.

## Tests and integration gates

Focused contract tests: `node --test tests/native-widget-snapshot-contract.test.js`. They cover scope validation, redaction, bounded payloads, canonical timing-mode filtering, malformed dates/times, weather staleness/null temperature, IANA validation, deep-link sanitization, account switch/sign-out and native-only staging.

Native stage: `npm.cmd run native:stage` on Windows; verify both `dist/index.html` and `dist/trip/custom/index.html` include the bridge script, while original PWA files do not.

**Android follow-up gate:** register the Java Capacitor plugin in `MainActivity`, wire the widget provider/metadata in AndroidManifest, reject stale `expiresAtEpochMs` snapshots, validate the widget UI in RTL/light/dark and test deep links, sign-out, account switching, offline, background refresh limitations and WebView startup on emulator/device. The current Android files in the isolated worktree are uncommitted exploratory work and must be reviewed independently before staging. Keep PR #146 Draft until runtime smoke passes.

**iOS later:** add a Capacitor iOS shell, WidgetKit extension and an App Group store with the same schema, account clearing, privacy and OS-managed refresh semantics. No iOS code is included here.
