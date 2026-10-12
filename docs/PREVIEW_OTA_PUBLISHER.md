# Preview OTA publisher

Routine web/PWA/backend development is OTA-first. Preview runs `node tools/classify-distribution.mjs <head-sha>` before regression tests and compares the candidate cumulatively with the fixed `OTA_BASE` in that tool. Native projects/configuration, bridges/plugins, resources/project files, overlay/API compatibility metadata, and newly introduced native dependencies/APIs produce `APK_REQUIRED` and block Preview deployment. Routine web/PWA/backend/tests/docs changes produce `OTA_ONLY`. Unknown paths or an invalid/divergent compatibility base fail closed.

The cumulative baseline is deliberate: if a native-required commit ever reaches `preview` and deployment is blocked, a later web-only commit cannot hide it. `OTA_BASE` advances only during an explicit native-shell release after that shell is accepted as compatible. Routine OTA releases never require changing the baseline or reinstalling the APK.

Preview stamps `channel: preview` into the existing loaded web diagnostic. About shows Hebrew System Status using that diagnostic and active-worker data. Native API is shown only when supplied by the native-staged build; the web application version is never presented as a shell version. Unstamped/unknown environments are identified honestly.

`ota-overlay.json` pins an exact native commit. The deployment stages and SHA-stamps the PWA normally, then the pinned overlay's `tools/stage-native-web.mjs` copies that exact web output and injects the native update/widget bridges into a separate directory. `publish-ota.mjs` verifies that the signing key matches the APK public key, signs the immutable ZIP and its metadata, and publishes them under `ota/<web-sha>/`. Both outputs must report the deployment SHA. An unavailable signing secret fails deployment before publishing either output.

Owner setup before Preview publishing: set GitHub Actions secret `TRAVELMATE_OTA_PRIVATE_KEY` to the permanent OTA private PEM from the restricted local signing directory. Never paste it into an issue/chat or commit it. Keep the existing permanent Android QA signer separate. Native API level 1 includes the current widget bridge, Geolocation 8, and LiveUpdate 8. New plugin/native API requirements need a new APK and overlay level.

No production/main deployment is authorized by Preview publishing. Local browser tests and isolated Android-emulator OTA tests do not constitute Samsung physical acceptance.
