# TravelMate iOS Native Foundation — 2.21.0

Status: Draft foundation on `chatgpt/ios-foundation`, based on the current Android/native P2 candidate. Do not merge to `preview` or `main` until the native runtime/device gates are complete.

## Ownership

- Root `capacitor.config.json` remains the canonical app identity and web staging configuration.
- `@capacitor/ios`, `@capacitor/android`, `@capacitor/core` and the CLI are pinned to the Capacitor 8 family used by TravelMate.
- iOS uses Swift Package Manager.
- `npm run native:stage` remains the single owner of the web runtime staged for both native shells.
- Generated `public/` web copies are not source-of-truth files and stay out of Git.

## iOS commands

- `npm run native:sync:ios` — stage the canonical TravelMate web runtime and sync the committed iOS project.
- `npm run native:copy:ios` — stage and copy web runtime only.
- `npm run native:open:ios` — open the Xcode project on an eligible Mac.

## CI gate

The iOS preflight runs on GitHub macOS/Xcode 26+ and must pass:

1. `npm ci --no-audit` from the committed lockfile.
2. `npm run native:sync:ios` from the committed `ios/` source.
3. Unsigned iOS Simulator build through `xcodebuild`.
4. Verification that the resulting `.app` contains the TravelMate Home, `assets/app.js`, custom-trip runtime and manifest.
5. Simulator `.app` artifact upload.

The Simulator build proves compile/package integrity only. It does not replace signing, App Group entitlements, WidgetKit runtime checks or real-iPhone validation.

## Widget roadmap

The first iOS widget remains **Budget**: spent, remaining/overrun or unlimited pace, Quick Expense deep link and converter deep link. It must reuse the existing privacy-scoped native snapshot; no second budget store or FX engine is allowed.

A WidgetKit extension will later use an App Group shared container so the containing app and widget can exchange only the bounded redacted snapshot. Live Today follows on the same contract. Widget refresh remains timeline/OS-managed; TravelMate does not promise minute-exact background refresh.

## Privacy boundary

Never place documents, notes, receipts, Health data, private messages, GPS history or arbitrary collaboration event bodies in the shared widget container. Account/trip isolation, sign-out clearing and redaction remain mandatory before WidgetKit is enabled.
