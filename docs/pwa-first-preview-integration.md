# Clean Preview integration evidence

Branch: integration/pwa-first-preview
Exact base: 7edd763b9132fac91b3287aaa593d2f107e4dbe6
RC source: 8f87d5376fb3e8f5d492228eb07771f7f247b0c2
Approved PWA reference: 01d35a4405fca6c27c108b6e905145f246f57aa3

## Source selection

Copies use git show at the exact source SHAs. No merge, memory-based reconstruction or native commit cherry-pick occurred. 51 RC paths plus the 9 reference-hardening paths produce 57 unique copied paths (three are overlaid by hardening).

The web/shared runtime is byte-identical to the approved reference, including untouched base files. Its only tree differences against that reference are the five unused/native-only asset omissions below. PWA manifest-referenced scenic SVG/PNG icons are preserved exactly. All HTML, JS/CSS, manifest and SW behavior matches the approved implementation.

A test-only adaptation removes the dependency on native package.json from profile-wizard-contract.test.js: it obtains the product version from About, the canonical existing web owner. A second test-only adjustment waits for the delayed SW registration before calling update(), removing a race exposed by the first CI run. Runtime implementation is unchanged. The PWA reference report is preserved verbatim as historical reference evidence; this report describes the clean branch, which does not inherit the native tree.

## Validation

- Full Node: 834 passed, zero failures/skips (native-only suites from reference excluded).
- Focused browser: 27 passed: 9 notifications, 4 category/reviews, 12 landing/home/short-layout, 2 real-worker update lifecycle tests.
- Full Playwright: 124 passed, zero failures, no retries; dedicated native bridge E2E excluded.
- A→B and exact old Preview→B both run at the same origin with a real SW, explicit refresh, no forced editing reload, unchanged local user fields and IndexedDB, unrelated cache survival, canonical owner isolation, and visible offline Overview/Plan/Budget/Places/Documents after closing/reopening the page.
- 360/390/430 and short-height layout coverage retained. Hero/Weather, PWA icons, Back, Profile, Mate, Budget and account/cloud regressions retained.
- Node syntax checks for every copied JS/MJS pass.
- Native projects, Capacitor manifest, native toolchain/package metadata, native signing and native workflows are absent. No new native tooling/test/docs are brought into Preview.
- Auth endpoint already exists in the exact Preview base. Shared browser auth/CAPTCHA regression tests remain; the dedicated native bridge E2E and native-only suites are excluded.

Physical phone and live authenticated Supabase acceptance are still required. Tests use synthetic account/document fixtures; no private data was accessed or cleared. No APK build occurred.

## Runtime exclusions against reference

- assets/app-icon-foreground.svg
- assets/app-icon-maskable.svg
- assets/budget-widget-actions.js
- assets/icons/travelmate-adaptive-source.png
- assets/native-widget-snapshot.js

## Exact copied RC paths

- .github/workflows/travelmate-integration-qa.yml
- assets/about.js
- assets/ai-assistant.js
- assets/app-icon.svg
- assets/app-shell.css
- assets/app-shell.js
- assets/app.js
- assets/auto-planner.js
- assets/cloud-sync.js
- assets/home-organizer.css
- assets/home.js
- assets/icons/travelmate-180.png
- assets/icons/travelmate-192.png
- assets/icons/travelmate-48.png
- assets/icons/travelmate-512.png
- assets/icons/travelmate-72.png
- assets/icons/travelmate-maskable-192.png
- assets/icons/travelmate-maskable-512.png
- assets/nearby.css
- assets/phone-visual-qa.css
- assets/plan-ux-polish.js
- assets/readable-glass.css
- assets/security-center.css
- assets/security-center.js
- assets/smart-plan-tools.js
- assets/trip-change-notifications.css
- assets/trip-change-notifications.js
- assets/trip-experience.js
- assets/trip-redesign.css
- assets/weather-widget.css
- assets/weather-widget.js
- index.html
- manifest.webmanifest
- sw.js
- tests/auth-captcha-runtime.test.js
- tests/currency-zero-regression.test.js
- tests/e2e/app-shell-insets.spec.js
- tests/e2e/mate-keyboard-shell.spec.js
- tests/e2e/new-trip-release.spec.js
- tests/e2e/places-hebrew-wrap.spec.js
- tests/e2e/release-widget-surfaces.spec.js
- tests/e2e/samsung-acceptance-fix2.spec.js
- tests/e2e/samsung-acceptance-fix3.spec.js
- tests/new-trip-budget-currency-contract.test.js
- tests/phone-visual-qa-contract.test.js
- tests/profile-wizard-contract.test.js
- tests/sync-conflict-ui-contract.test.js
- tests/weather-v2-visual-contract.test.js
- trip/custom/index.html
- trip/italy-2028/index.html
- trip/japan-2027/index.html

## Exact copied hardening paths

- .github/workflows/deploy-pages.yml
- assets/about.js
- assets/app.js
- docs/pwa-update-hardening.md
- sw.js
- tests/e2e/pwa-update-lifecycle.spec.js
- tests/performance-contract.test.js
- tests/pwa-update-contract.test.js
- tools/stamp-web-build.mjs

## All RC paths deliberately excluded

- .github/workflows/android-foundation-qa.yml
- .github/workflows/deploy-pages.yml
- .github/workflows/ios-budget-widget-qa.yml
- .github/workflows/ios-foundation-bootstrap.yml
- .github/workflows/ios-foundation-preflight.yml
- .github/workflows/ios-live-today-widget-qa.yml
- .github/workflows/ios-notifications-widget-qa.yml
- .github/workflows/ios-weather-widget-qa.yml
- .github/workflows/release-ios-qa.yml
- android/.gitignore
- android/app/.gitignore
- android/app/build.gradle
- android/app/capacitor.build.gradle
- android/app/proguard-rules.pro
- android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java
- android/app/src/main/AndroidManifest.xml
- android/app/src/main/java/com/travelmate/app/MainActivity.java
- android/app/src/main/java/com/travelmate/app/TravelMateLiveTodayWidgetProvider.java
- android/app/src/main/java/com/travelmate/app/TravelMateWidgetBridgePlugin.java
- android/app/src/main/java/com/travelmate/app/TravelMateWidgetProvider.java
- android/app/src/main/res/drawable-land-hdpi/splash.png
- android/app/src/main/res/drawable-land-mdpi/splash.png
- android/app/src/main/res/drawable-land-xhdpi/splash.png
- android/app/src/main/res/drawable-land-xxhdpi/splash.png
- android/app/src/main/res/drawable-land-xxxhdpi/splash.png
- android/app/src/main/res/drawable-port-hdpi/splash.png
- android/app/src/main/res/drawable-port-mdpi/splash.png
- android/app/src/main/res/drawable-port-xhdpi/splash.png
- android/app/src/main/res/drawable-port-xxhdpi/splash.png
- android/app/src/main/res/drawable-port-xxxhdpi/splash.png
- android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml
- android/app/src/main/res/drawable/ic_launcher_background.xml
- android/app/src/main/res/drawable/splash.png
- android/app/src/main/res/drawable/travelmate_widget_action_background.xml
- android/app/src/main/res/drawable/travelmate_widget_background.xml
- android/app/src/main/res/drawable/travelmate_widget_secondary_action_background.xml
- android/app/src/main/res/drawable/travelmate_widget_unread_background.xml
- android/app/src/main/res/layout/activity_main.xml
- android/app/src/main/res/layout/travelmate_live_today_widget.xml
- android/app/src/main/res/layout/travelmate_widget.xml
- android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
- android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
- android/app/src/main/res/mipmap-hdpi/ic_launcher.png
- android/app/src/main/res/mipmap-hdpi/ic_launcher_background.png
- android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
- android/app/src/main/res/mipmap-mdpi/ic_launcher.png
- android/app/src/main/res/mipmap-mdpi/ic_launcher_background.png
- android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
- android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
- android/app/src/main/res/mipmap-xhdpi/ic_launcher_background.png
- android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
- android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
- android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.png
- android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
- android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
- android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png
- android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
- android/app/src/main/res/values/ic_launcher_background.xml
- android/app/src/main/res/values/strings.xml
- android/app/src/main/res/values/styles.xml
- android/app/src/main/res/xml/backup_rules.xml
- android/app/src/main/res/xml/data_extraction_rules.xml
- android/app/src/main/res/xml/file_paths.xml
- android/app/src/main/res/xml/travelmate_live_today_widget_info.xml
- android/app/src/main/res/xml/travelmate_widget_info.xml
- android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java
- android/build.gradle
- android/capacitor.settings.gradle
- android/gradle.properties
- android/gradle/wrapper/gradle-wrapper.jar
- android/gradle/wrapper/gradle-wrapper.properties
- android/gradlew
- android/gradlew.bat
- android/settings.gradle
- android/variables.gradle
- assets/app-icon-foreground.svg
- assets/app-icon-maskable.svg
- assets/budget-widget-actions.js
- assets/icons/travelmate-adaptive-source.png
- assets/native-widget-snapshot.js
- capacitor.config.json
- docs/ANDROID_QA_SIGNING.md
- docs/HEALTH_CONNECT_V2_1_HE.md
- docs/SAMSUNG_ACCEPTANCE_FIX2_20261011.md
- docs/SAMSUNG_ACCEPTANCE_FIX3_20261011.md
- docs/SAMSUNG_RC_CONTINUATION_20261010.md
- docs/android-native-rc-turnstile-gate.md
- docs/ios-budget-widget.md
- docs/ios-live-today-widget.md
- docs/ios-native-foundation.md
- docs/ios-notifications-widget.md
- docs/ios-weather-widget.md
- docs/native-widget-snapshot.md
- ios/.gitignore
- ios/App/App.xcodeproj/project.pbxproj
- ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist
- ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
- ios/App/App/App.entitlements
- ios/App/App/AppDelegate.swift
- ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
- ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json
- ios/App/App/Assets.xcassets/Contents.json
- ios/App/App/Assets.xcassets/Splash.imageset/Contents.json
- ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
- ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
- ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
- ios/App/App/Base.lproj/LaunchScreen.storyboard
- ios/App/App/Base.lproj/Main.storyboard
- ios/App/App/Info.plist
- ios/App/App/SceneDelegate.swift
- ios/App/App/TravelMateBridgeViewController.swift
- ios/App/App/TravelMateWidgetBridgePlugin.swift
- ios/App/CapApp-SPM/.gitignore
- ios/App/CapApp-SPM/Package.swift
- ios/App/CapApp-SPM/README.md
- ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift
- ios/App/TravelMateBudgetWidget/Info.plist
- ios/App/TravelMateBudgetWidget/TravelMateBudgetWidget.entitlements
- ios/App/TravelMateBudgetWidget/TravelMateBudgetWidget.swift
- ios/App/TravelMateBudgetWidget/TravelMateLiveTodayWidget.swift
- ios/App/TravelMateBudgetWidget/TravelMateNotificationsWidget.swift
- ios/App/TravelMateBudgetWidget/TravelMateWeatherWidget.swift
- ios/debug.xcconfig
- package-lock.json
- package.json
- tests/app-icon-contract.test.js
- tests/app-shell-runtime.test.js
- tests/budget-widget-contract.test.js
- tests/e2e/native-captcha-bridge.spec.js
- tests/ios-budget-widget-contract.test.js
- tests/ios-live-today-widget-contract.test.js
- tests/ios-notifications-widget-contract.test.js
- tests/ios-weather-widget-contract.test.js
- tests/live-today-widget-contract.test.js
- tests/native-auth-captcha-contract.test.js
- tests/native-foundation-contract.test.js
- tests/native-today-parity.test.js
- tests/native-widget-snapshot-contract.test.js
- tools/apk_png.py
- tools/configure-ios-budget-widget.rb
- tools/generate-android-launcher.mjs
- tools/icon-source/README.md
- tools/icon-source/background.png
- tools/icon-source/foreground.png
- tools/icon-source/master.png
- tools/icon-source/sources.json
- tools/png-raster.mjs
- tools/stage-native-web.mjs
- tools/test_android_signing.py
- tools/verify-android-apk.py
- tools/verify-android-signing.py

## Publication boundary

The clean branch descends exclusively from the requested Preview base, allowing a normal fast-forward if Preview remains at that SHA. PR #154 stays Draft/unmerged at its original RC head. Main and Preview are unchanged. No publication is authorized by this task.

The only non-native tree differences from the approved reference are this task-specific evidence document and two test-only adaptations (native-package dependency removed and explicit wait for SW registration); there are no extra web runtime differences.
