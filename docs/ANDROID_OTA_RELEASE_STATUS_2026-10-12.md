# Android / OTA release status — 2026-10-12

**Overall readiness: PARTIAL**

This status note records the verified handoff after the Android/OTA hardening pass. It is documentation only and does not claim a deployment, published APK, Samsung validation, or remote availability of the local hardening commits.

## Baseline
- Preview baseline: `32eadf7f1af38dd952e399868626057e8dc362fc` — TravelMate 2.24.0.
- Local web hardening branch: `codex/android-ota-hardening-20261012` — reported commit `92b8497a5bc9cef6bbcf0b24bfac975bc8a492dd`.
- Local native hardening branch: `codex/android-ota-native-hardening-20261012` — reported commit `79b6128e7e4310c6deb97c542318dc92f3516a23`.
- Remote verification on 2026-10-12: neither hardening branch nor either reported hardening commit was present on GitHub at the time of this note. Treat them as local evidence until explicitly pushed.

## Architecture verified by the hardening pass
- Native uses a bundled local web app plus signed LiveUpdate; no fixed `server.url`.
- Browser/PWA update flow is separate and uses the Service Worker.
- Key ownership files include `ota-overlay.json`, `capacitor.config.json`, `assets/native-live-update.js`, and `tools/stage-native-web.mjs`.

## Main blocker
The public Web build and OTA metadata were reported aligned at 2.24.0 / Preview SHA, but a historical QA APK trusts a different OTA public key and rejects the current manifest. Android signing-certificate continuity and OTA trust-anchor continuity are separate concerns.

The currently installed phone APK was **not inspected**, so compatibility must not be inferred from the historical APK. Current release classifier: **`APK_REQUIRED`**.

## Fixes reported and tested locally
- Validate `nativeApiLevel` returned by the native bridge before download/verification.
- Preserve known `channel: preview` during native staging.
- Show deferred/native-update status in About and keep Web/native-shell versions distinct when shell version is unavailable.
- Keep active OTA pin and trust anchors unchanged; diagnose mismatches rather than silently rotating keys.

Reported test evidence:
- Web Node: 872/872.
- Playwright: 168/168, no retries, 360/390/430, RTL, light/dark.
- Native focused: 37/37.
- Native canonical Git-byte suite: 952/952.
- Original Windows checkout: 948/949, isolated to LF/CRLF SVG byte mismatch.
- Diagnostic APK build/sign/package checks passed using the existing QA certificate, but the artifact remains 2.21.1 / 22101 and is **not** a 2.24.1 release APK.

## Not tested / not authorized
- No Samsung or physical-device runtime test today.
- No real Android LiveUpdate download/rollback test today.
- No installed-phone APK provenance check.
- No live authenticated cloud/account restoration.
- No push/merge/deployment/APK publication is represented by this note.

## Coordinated release gate
Before native/OTA release:
1. Identify the actual installed APK provenance, Android signing certificate, embedded OTA trust key, native API level, package/versionCode, and embedded web SHA without clearing app data.
2. Resolve whether the installed shell already trusts the active OTA key. If not, use an explicitly authorized native upgrade path; do not rotate trust or signing identities as a shortcut.
3. Produce an exact-SHA release candidate with reviewed native Gradle version metadata and embedded Web SHA/version.
4. Re-run Web/native automated suites and verify signed metadata/ZIP against the exact release artifacts.
5. At the later agreed device-validation stage, test update-in-place, data retention, offline boot, LiveUpdate activation and rollback on the real device.
6. Only then authorize coordinated Preview/native/OTA publication and record rollback instructions.

## Roadmap effect
- Android/OTA investigation is no longer generic discovery: it is **PARTIAL / APK_REQUIRED** with a specific trust-provenance blocker.
- Nearby one-tap reliability remains the first functional P0 workstream and can proceed independently in its own branch.
- Smart Trip, Travel Memories and Journey Studio must not depend on unverified native update assumptions.
