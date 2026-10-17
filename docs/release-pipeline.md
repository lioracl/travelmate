# Focused release pipeline compatibility

Preview deployment, manual QA APK generation, and future explicitly reviewed OTA publication are separate actions. Preview and APK jobs cannot sign or create OTA updates. No new repository variable, secret, permission, trust anchor, compatibility baseline or native migration is introduced.

## Preserving the currently published OTA

The previous deployment started a fresh _site and its pinned publisher wrote exactly three OTA files. It did not retain all historical bundles. Run 38715322778 successfully deployed Preview e8513167165b0363a497199e83e176c868173923; its artifact collection is now empty. Existing live bytes can still be preserved without recovering expired artifacts.

Independent review verified the current public state:

| Path under https://lioracl.github.io/travelmate/ota/ | Bytes | SHA256 |
| --- | ---: | --- |
| latest.json | 2095 | 6bd0e4f2ded671520f3e0a900ef764dc23f7ee241d27e69c070dfa1d8b5dd4f9 |
| e8513167165b0363a497199e83e176c868173923/manifest.json | 2095 | 6bd0e4f2ded671520f3e0a900ef764dc23f7ee241d27e69c070dfa1d8b5dd4f9 |
| e8513167165b0363a497199e83e176c868173923/bundle.zip | 2758973 | 0f2a696b92ae669527ac3fde1a35682d6ee0f8b881f19ba80b2007c5d4081519 |

The pointer and immutable manifest are byte-identical. Review verified both RSA signatures against the existing binary trust anchor. These are supplied independent review results; the local draft tests use synthetic signed fixtures and do not claim another live fetch.

At deployment, retain-preview-ota.mjs independently revalidates the public successful Preview run and successful deploy step using the fixed public GitHub API, checks live Preview build-info against that deployed SHA, verifies the source recipe by its Git blob identity, and proves the original pinned publisher/native-overlay contract. No credentials are sent to these public endpoints. It accepts the known legacy deployment or the byte-identical current retention recipe from a subsequent successful deployment; changed/unknown source recipes fail closed.

It then reads the fixed-origin latest pointer, verifies its signature and exact SHA/API/version/URL, obtains that exact immutable manifest and bundle, and checks signatures, hashes, sizes and the concrete independently verified bytes above. Redirects, unsafe paths, missing/inconsistent evidence, unknown directory responses, and any additional paths exposed by directory listings cause failure. Normal Pages directory 404s are accepted because the verified source recipe establishes the current three-file output; the tool does not claim to discover or recover historical URLs absent from that deployment.

Only after all checks does it copy those three byte buffers unchanged into a fresh _site/ota. The ephemeral evidence sidecar stays outside the deployed directory. The live pointer, live build-info and successful deployment identity are checked again during capture, directly before Pages artifact upload, and directly before Pages publication. A concurrent move fails closed so a stale pointer is not knowingly redeployed. There is an unavoidable interval between a final read and a remote publication; existing Preview concurrency remains unchanged.

This is retention of an already published version: the same files, signatures, pointer and URLs remain byte-for-byte identical. Publishing a new OTA would generate a different bundle/manifest or move latest to a different version and requires separate approval. This patch does none of those things. The existing publisher stays unchanged in the native pin; neither workflow invokes it or receives its private key. A future approved OTA publisher must explicitly coordinate the new known public state with these bounded preservation checks.

Preview remains push-only for deployment; PR and manual runs verify without deployment. Existing deployed state remains untouched when preservation fails. No retention.json, owner-audited all-history index, public digest variable or expired-artifact recovery is required.

## Manual exact Preview APK

The clean Preview tree has no APK-producing foundation workflow. The new Android Exact Preview APK entrypoint therefore combines the existing pinned native wrapper, staging tool, foundation signing configuration, signing verifier/tests and resource decoder. The compile-only voice QA workflow is unchanged. Native application code and the original pinned commit are unchanged.

Dispatch only from preview after parent/CI review, with the full deployed web SHA and explicit expected wrapper versionName/versionCode. At authorized native pin d80d9909e78ffdca831251b514d1a54f11e9118a the wrapper is 2.26.1/code22601/API2. The web version is separately derived from the exact web source; current deployed Preview is web2.26.2. Source assertions compare the requested version/code with Gradle rather than ignoring the mismatch or retaining obsolete 2.21.1/API1 assumptions.

The unchanged classifier runs against the exact web SHA and the existing OTA_BASE. Its full result is logged; anything except OTA_ONLY with no native-impact reasons is rejected for this fixed authorized API2 wrapper. The gate also requires the exact authorized overlay repository/SHA/API. Classification errors propagate. OTA_BASE is never advanced to conceal a native delta.

Official Capacitor8.5.2 sources confirm that Android copy.ts copies app.webDir to android.webDir then invokes handleCordovaPluginsJS; without Cordova plugins, createEmptyCordovaJS writes empty cordova.js and cordova_plugins.js in the Android web directory:

- https://github.com/ionic-team/capacitor/blob/8.5.2/cli/src/cordova.ts
- https://github.com/ionic-team/capacitor/blob/8.5.2/cli/src/tasks/copy.ts

The actual APK verifier therefore requires the staged file set PLUS exactly those two generated zero-byte files. It rejects either missing file, either nonempty replacement, staged-source substitution, every unknown extra, and any missing or changed staged file. It retains icon pixel/density/adaptive resource, widget, application ID, version/code/SDK, origin and native plugin configuration checks.

The workflow captures official deployed Preview build-info before staging and compares SHA/channel/web version with the exact checkout. Final APK acceptance fetches it again and rejects a concurrent Preview move before artifact upload. Both evidence records are uploaded with the contract, classifier proof and APK provenance. No moving branch tip is used for web staging.

Existing signing names remain TRAVELMATE_QA_KEYSTORE_BASE64, TRAVELMATE_QA_STORE_PASSWORD, TRAVELMATE_QA_KEY_ALIAS, TRAVELMATE_QA_KEY_PASSWORD and public TRAVELMATE_QA_CERT_SHA256. Missing or partial signing fails; no ephemeral signer is accepted. Secrets are scoped to validation, signer setup and the required Gradle build step; public verification and dependency/native tests do not receive secret values. Keystore setup registers its unique task-owned path before decoding and installs a same-step failure trap, covering a partially decoded file. Always-cleanup deletes only that task-owned keystore.

The route preserves Node22, Temurin21, Capacitor8.5.2, Gradle8.14.3, AGP8.13.0, minSDK26, compile/targetSDK36, build-tools36.0.0, applicationId com.travelmate.app, packaged localhost origin, no remote shell, LiveUpdate strategy none and retained bundles. Runtime auth/sync and all source tests remain intact. No permissions/security policy or credential identity is changed.

Artifacts include APK, SHA256, signature/certificate report, manifest/badging, source contract, explicit classifier compatibility result, public provenance, initial/final deployed Preview evidence and embedded build-info. There is no public Release, OTA, device installation or chained workflow dispatch.

## Validation limits

Local syntax, synthetic package and signed-fixture checks do not constitute an actual Android build or APK signature pass. VersionCode22601 plus a matching configured certificate also do not prove upgrade compatibility with the phone's installed build. Secret presence, installed signer/version and real CI outcomes remain unproven; this task accesses no device and uses no configured signer.

Local Git Bash syntax validation was denied during the first draft's MSYS startup and was not retried or bypassed. Independent review parsed the earlier draft's YAML and 16 shell blocks; that report is external evidence for that earlier revision, not local validation or current CI. No dependencies were installed locally.
