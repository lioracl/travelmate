# Local emulator OTA acceptance — 2026-10-11

Four instrumented Android acceptance tests passed on the isolated API 36 emulator.

- Bundled/installed A: `83342066979cddad32b953220a0c464f57bfbee3`.
- Preview web + pinned native overlay B: `19a736f7c82a321d53d9ee89a7c2a0f09043bffb`.
- Signed B ZIP SHA256: `2ad0710ab2b0e0969ef861ed2adf0b6e2aa71b59b81a46bf02f02bc970338382`.
- Actual native LiveUpdate downloaded and staged B while A and an unsaved draft remained active. The following start activated B without rebuilding the APK.
- B diagnostics and LiveUpdate current bundle matched the exact B SHA. Synthetic localStorage trip/expense/place data and IndexedDB document metadata survived. No active Service Worker. The emulator reopened with external networking disabled.
- Native plugin rejected a bad signature. Signed metadata requiring nativeApiLevel 2 was rejected by the API 1 shell.
- A signed broken bundle without a readiness acknowledgement timed out, was blocked, and returned to bundled A. Synthetic user data survived; Service Worker stayed inactive.

Transport was an emulator-only loopback HTTPS fixture server, with a temporary CA trusted only by the test emulator. Signed metadata retained its production immutable URL; the test transport mapped it to loopback. No Preview deployment or public tunnel was used. Production trust and update validation were not weakened.

`OtaAcceptanceTest` is a fixture-specific opt-in test: it requires the staged B fixture, synthetic data and local HTTPS server from this acceptance run. Run only on an isolated emulator with ANDROID_SERIAL selected. Its fixed SHAs document this evidence, not a generic CI environment. The final source commit adds this test/report only; the publisher intentionally pins the already-tested functional native overlay at 833420.

This proves local emulator OTA behavior, not physical Samsung acceptance or live Preview publication. Real account/cloud restore and physical widget behavior remain covered by existing contracts and owner device retest, not by these synthetic data fixtures.
