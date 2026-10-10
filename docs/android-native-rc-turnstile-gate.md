# TravelMate V2.21 RC — Android launcher and Turnstile release gate

This work is isolated from `preview` and the installed older APK. Do not merge until native CI and a real-device smoke pass succeed.

## Launcher

The previous Android legacy and round PNGs had opaque white corners and the adaptive foreground artwork was horizontally offset. Regenerate the five Android density families with `node tools/generate-android-launcher.mjs`; the immutable source is `assets/icons/travelmate-adaptive-source.png`. Verify `ic_launcher`, `ic_launcher_round`, and `ic_launcher_foreground` inside the built APK and check Samsung One UI home screen, app drawer, light/dark wallpaper, and reinstall/launcher-cache behavior. The existing PWA icons are separate and were not modified by this pass.

## Turnstile authentication

The packaged Capacitor Android WebView uses `localhost` as its local origin (no custom `server.url` in `capacitor.config.json`). The app uses the public Turnstile sitekey in `assets/supabase-config.js`; Supabase validates tokens on the server. Cloudflare client error **110200** means the widget hostname is not authorized, not that Supabase credentials are wrong.

The owner must inspect **Cloudflare → Turnstile → the widget matching the configured sitekey → Settings → Hostname Management**. Confirm the exact WebView origin from Android diagnostics before modifying hostnames. Cloudflare allows `localhost` for local testing but recommends excluding local hostnames from production; choose a production-safe mobile origin/verification design rather than globally disabling hostname enforcement. If using a second mobile widget, coordinate its server-side verification secret with Supabase; never silently swap sitekeys or disable CAPTCHA. Check WebView JavaScript/DOM storage/cookies, network to `challenges.cloudflare.com`, CSP, and the consistent user agent. Test sign-in, sign-up, signup resend, password reset, expired/failed/replayed tokens, and account isolation.

The UI now surfaces the exact 110200 error and network/script failures accessibly; it still refuses auth without a valid token. This is a diagnostic improvement, **not** proof the Cloudflare dashboard is configured correctly.

Official references:
- https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
- https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/
- https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/
- https://developers.cloudflare.com/turnstile/troubleshooting/testing/

## Release gates

Node focused and full regression, JS syntax and `git diff --check` must pass. Then run `npm ci --no-audit`, `npm run native:sync`, Android Gradle `testDebugUnitTest assembleDebug`, APK package/resource inspection, and GitHub Android/Integration QA on the exact commit. Do not publish an APK from an unverified SHA. A physical Samsung test is deferred to the user.
