# Samsung RC continuation — 2026-10-10

Baseline: 0e48f4fac0a9da6d7e71a362c3c7ccbfe8ae7c2a. This continuation preserves that implementation and addresses the supplied Samsung screenshots. Old APK evidence is not final-build evidence.

## Changes and focused evidence

- A: assets/home.js and security-center.js invalidate CAPTCHA on close/error/timeout and recover rejected resend. Exact origin/source/nonce/token validation retained. 33 focused auth tests and 8 browser bridge tests passed.
- B: assets/app-shell.css/js own safe-area geometry using Capacitor SystemBars CSS insets, with env fallback. HTML includes, config and precache wired. Legacy top:0 and width:100% conflicts removed. 29 shell/New Trip/Weather checks passed; includes synthetic cutouts and navigation insets.
- C: reviewed scenic master and derived layers under tools/icon-source; deterministic generator owns 30 Android/PWA/iOS outputs. Eight icon tests pass, byte reproduction, nonempty/color content and adaptive safe circle included. 48/192 and adaptive foreground visually inspected. tools/apk_png.py and verify-android-apk.py compare decoded packaged icon pixels with sources after aapt processing. Physical Samsung masking is pending.
- D: nearby.css removes midword wrapping only on short category labels; phone grid uses two columns. One browser regression covers 360/390/430 Hebrew labels and glyph-range line boundaries.
- E: ai-assistant.js handles simultaneous native innerHeight/visualViewport shrink. Shell owns Mate inset geometry and header stacking. Quick prompts hide during keyboard use; composer and chat remain visible. Both simulated IME modes pass, including close/focus return. Drawer uses a slightly denser existing family tint, without additional blur.
- Release: cache revision 20261010-03; About updated; version remains 2.21.0 / Android 22100.

Local regression: 912 Node PASS and 105 Playwright PASS, no failures/skips. Eighteen changed JS/MJS files pass syntax checks. Final CI must run on the exact pushed SHA; record its IDs and final APK in the delivery report.

Cloudflare READ-ONLY confirmation on 2026-10-10: TravelMate site key 0x4AAAAAAEPl5T3VCWJgnHPE; sole hostname lioracl.github.io; Managed selected; pre-clearance off. No configuration changes. Real provider challenge/auth still needs new-APK Samsung testing.

## Acceptance remains manual

Upgrade over the installed APK first; preserve local data. Check Home/App Drawer scenic icon and AI, system status/navigation bars in three-button and gesture modes, portrait/landscape, light/dark contrast, real CAPTCHA login/signup/resend/reset/error/timeout/close-reopen, Places labels, Mate keyboard, menu, New Trip, expanded Weather, Overview/Plan/Documents/Profile/Back. Check cold offline saved trips, logout/account switching and widget privacy/refresh. Do not delete data to refresh icons.

PR #154 stays draft/unmerged. No main write or RC preview deployment. Preview only contains the separately approved two-file CAPTCHA endpoint publication. iOS shared build is automated coverage, not iOS authentication/device acceptance. Physical-device acceptance and release signing remain separate gates; this is a debug Samsung-test candidate.
