# Permanent QA shell and self-hosted updates

Android starts a complete local bundle. It never uses server.url. Capacitor LiveUpdate 8.6.0 owns native updates; the Service Worker owns browser/PWA updates only.

After the core shell is usable, ready() acknowledges startup without waiting for cloud/auth/weather. A background check verifies RSA-signed metadata against the public key returned by the installed native bridge, rejects nativeApiLevel above the binary's level (1), verifies SHA-256, and asks the native plugin to verify the ZIP signature. setNextBundle stages the bundle for the next cold start. There is no reload call. readyTimeout=20000 and autoBlockRolledBackBundles enable native fallback to the embedded default. No data storage is cleared.

Preview produces a PWA site plus an OTA bundle from the same exact web SHA and a pinned native overlay SHA. The overlay's stage-native-web.mjs injects native bridge scripts only into the OTA output. The binary public key and nativeApiLevel cannot be supplied by the remote metadata. Signed metadata binds web SHA, immutable URL, digest, native API, version and ZIP signature. Offline update failures leave the current local runtime intact.

Local permanent QA signer: %LOCALAPPDATA%/TravelMate/signing/travelmate-qa.p12. Its random password is stored in qa-password.dpapi, encrypted for the Windows user. The folder has restricted ACLs. OTA uses a separate RSA key in the same restricted folder. Neither belongs in Git. Keep a secure owner-managed backup; never regenerate these identities as part of builds.

Existing Actions secrets: TRAVELMATE_QA_KEYSTORE_BASE64, TRAVELMATE_QA_STORE_PASSWORD, TRAVELMATE_QA_KEY_ALIAS, TRAVELMATE_QA_KEY_PASSWORD. Variable: TRAVELMATE_QA_CERT_SHA256. OTA publisher secret: TRAVELMATE_OTA_PRIVATE_KEY (PEM). No secrets should be sent through chat. Missing CI signing must fail rather than produce a disposable APK.

Local build: tools/build-qa-local.ps1 reuses the existing Gradle signing environment contract. Package com.travelmate.app, version 2.21.1, versionCode 22101. Preview remains undeployed until owner approval. The first installation migrates from the historical disposable signer; subsequent native builds must reuse this signer.
