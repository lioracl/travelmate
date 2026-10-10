# TravelMate V2.21 RC — Android launcher and Turnstile release gate

This work is isolated from `preview` and the installed older APK. Do not merge until native CI and a real-device smoke pass succeed.

## Launcher

The previous Android legacy and round PNGs had opaque white corners and the adaptive foreground artwork was horizontally offset. Regenerate the five Android density families with `node tools/generate-android-launcher.mjs`; the immutable source is `assets/icons/travelmate-adaptive-source.png`. Verify `ic_launcher`, `ic_launcher_round`, and `ic_launcher_foreground` inside the built APK and check Samsung One UI home screen, app drawer, light/dark wallpaper, and reinstall/launcher-cache behavior. The existing PWA icons are separate and were not modified by this pass.

## Turnstile authentication

The packaged Capacitor Android WebView uses `localhost` as its local origin (no custom `server.url` in `capacitor.config.json`). The app uses the public Turnstile sitekey in `assets/supabase-config.js`; Supabase validates tokens on the server. Cloudflare client error **110200** means the widget hostname is not authorized, not that Supabase credentials are wrong.

Dashboard inspection on 2026-10-10 confirmed the matching public sitekey, Managed mode, only `lioracl.github.io` authorized, and pre-clearance disabled. Installed Capacitor 8.5.2 uses `https://localhost`; JavaScript and DOM storage are enabled. No Cloudflare permission, hostname, secret, or Supabase setting was changed.

Android now embeds the isolated hosted challenge at `https://lioracl.github.io/travelmate/auth/turnstile.html`. The two endpoint files were explicitly approved by the user and published alone to preview in commit `7edd763b9132fac91b3287aaa593d2f107e4dbe6` (Deploy Preview run 38027668501). This approval does not authorize merging PR #154 or publishing the rest of this RC.

The bridge validates exact parent/child origins, frame source, channel and a per-frame cryptographic nonce. It transmits challenge state and tokens only, never passwords or account records. The local native origin stays unchanged to preserve offline and account storage. Expiry, load errors, retries and resets clear the token; overlapping authentication requests cannot reuse it. Sign-in, sign-up, resend and reset remain fail-closed and supply the token to Supabase for server validation.

Runtime and browser tests exercise these paths with a mocked challenge provider. They do not establish that a physical Android WebView receives and completes a real Cloudflare challenge. A fresh Samsung install/upgrade and all four live authentication flows remain a release gate.

Official references:
- https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
- https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/
- https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/
- https://developers.cloudflare.com/turnstile/troubleshooting/testing/

## Release gates

Node focused and full regression, JS syntax and `git diff --check` must pass. Then run `npm ci --no-audit`, `npm run native:sync`, Android Gradle `testDebugUnitTest assembleDebug`, APK package/resource inspection, and GitHub Android/Integration QA on the exact commit. Do not publish an APK from an unverified SHA. A physical Samsung test is deferred to the user.
