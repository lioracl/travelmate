# Preview OTA publisher

This branch is based on clean web commit 9f23e67bc9a47596d267efe29a8f0fc2713254ac. It contains web presentation fixes and publisher configuration only. No Android/iOS project or Capacitor configuration is imported.

`ota-overlay.json` pins an exact native commit. The deployment stages and SHA-stamps the PWA normally, then the pinned overlay's `tools/stage-native-web.mjs` copies that exact web output and injects the native update/widget bridges into a separate directory. `publish-ota.mjs` verifies that the signing key matches the APK public key, signs the immutable ZIP and its metadata, and publishes them under `ota/<web-sha>/`. Both outputs must report the deployment SHA. An unavailable signing secret fails deployment before publishing either output.

Owner setup before Preview publishing: set GitHub Actions secret `TRAVELMATE_OTA_PRIVATE_KEY` to the permanent OTA private PEM from the restricted local signing directory. Never paste it into an issue/chat or commit it. Keep the existing permanent Android QA signer separate. Native API level 1 includes the current widget bridge, Geolocation 8, and LiveUpdate 8. New plugin/native API requirements need a new APK and overlay level.

No Preview deployment is authorized by this branch's creation or push. PR #154 remains untouched. Local browser tests and isolated Android-emulator OTA tests do not constitute Samsung physical acceptance.
