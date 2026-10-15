# Mate Voice 2.26.2 — OTA recovery candidate

## Compatibility decision

**OTA POSSIBLE. Native changed: NO. New APK required: NO.**

The owner tested installed QA 2.26.1/versionCode 22601/Native API 2 on Samsung and confirmed native TTS/STT are exposed. Accepted web boundary: `81ff06343c49b9a395661f54bfc873a3ccb85644`; unchanged native dependency: `d80d9909e78ffdca831251b514d1a54f11e9118a`. `ota-overlay.json`, native API metadata, Android version/permissions/plugin and signing remain unchanged. The cumulative OTA classifier is advanced only to this owner-accepted native release, with a test binding the exact SHA/pin and preserving rejection of later native changes.

| Fix | Owner | Distribution |
|---|---|---|
| Final dictation completion and once-only auto-send | mate-voice.js + ai-assistant.js | Web/OTA |
| Auto-send setting, default ON, account scoped | settings-preferences.js + existing Settings UI | Web/OTA |
| Six distinguishable delivery parameter pairs | existing canonical style map | Web/OTA |
| Installed voice list/voiceURI | existing API2 provider and device selector | Existing native contract; no native edit |
| Exact `https://localhost` origin | supabase/functions/travel-assistant/index.ts | Edge Function deployment separately authorized |
| Status/code classification | shared invoke and friendlyError | Web/OTA |

## Call flows and root causes

Mic tap → canonical Voice controller → API2 `startListening` → Android SpeechRecognizer final result → provider `stt-result` → controller final-only transcript → `stt-end` → guarded `onComplete` → existing `sendMessage` → canonical busy/auth/account protections. Interim results do not complete. Error/cancel invalidates the session; duplicate end/result and stale account/trip/navigation/background callbacks cannot send. OFF keeps editable text and explicit manual Send. The listening status announces the selected behavior.

Settings → account-scoped preferences → canonical style map → controller utterance → provider `speak` rate/pitch/volume/voiceURI → existing Android plugin. API2 exposes `getVoices()` entries reported non-network and without missing-data flags. The requested voiceURI is tried first using `setVoice`; Hebrew/local fallbacks are tried if unavailable or rejected. Current API2 clamps rate/pitch to 0.8–1.2. Previous styles used a narrow portion of that range. The web map now uses that supported range without new native APIs:

| Style | rate | pitch | volume |
|---|---:|---:|---:|
| Auto | 1 | 1 | 1 |
| Calm | 0.8 | 0.9 | 0.85 |
| Friendly | 1 | 1.2 | 1 |
| Professional | 1.1 | 0.8 | 1 |
| Energetic | 1.2 | 1.1 | 1 |
| Clear | 0.9 | 1.1 | 1 |

Every pair differs by at least 0.1 in rate or pitch; Calm/Energetic differ by 0.4 rate. Tests assert values reaching the provider, independent of selected voice. Style means delivery, not a different person. Tests simulate two Hebrew voices; the actual Samsung voice inventory is NOT known from this work. No voices or gender variants are invented. Whether Samsung's installed engine ignores parameters and how natural they sound still requires Lior's physical retest. Optional future native diagnostics could report effective voice/parameter acceptance, but are deliberately outside this release.

Mate request → Supabase functions.invoke(travel-assistant) → explicit CORS gate → JWT/usage validation → Gemini → answer/error. Repository allowlist omitted Capacitor's exact origin. The prepared source patch adds only `https://localhost`, retaining Pages and all four dev origins, Vary: Origin, auth checks and unknown-origin rejection. No wildcard. Production project/version information came from the owner's evidence; production was not queried, deployed or mutated.

Structured error bodies are read once in the shared request wrapper so contextual and chat paths see the same codes. Only HTTP404/explicit missing-function code says missing. 403/ORIGIN_NOT_ALLOWED and opaque Android fetch failures never claim the function is undeployed. JWT/auth, AI_NOT_CONFIGURED, provider errors, timeout and usage remain distinct. UI messages omit server secret names and configuration details. Opaque transport errors cannot prove CORS by themselves; the Android message asks to check connection authorization.

## Verification and limits

See the final task report and CI for exact counts. Deterministic Node tests run the real Edge handler in a mocked Deno host, not a deployed function. Browser tests use a mocked Native API2 plugin and mocked AI client; no real AI requests, audio uploads or production mutations occur. Mobile coverage includes Hebrew RTL 360/390/430 light/dark, simulated viewport shrink, microphone/Send visibility, final-only once-only sending, OFF/manual editing, errors, cancellation, settings reload and distinct device voice selection. Samsung keyboard, audio quality and network provider behavior remain physical-device acceptance.

Baseline independently verified: web Node 1103/1103, unchanged native Node 936/936 after Windows checkout CRLF normalization to the exact SVG Git blob. No native content change. Tests are not deleted, retries are zero, existing manual-mode tests explicitly select auto-send OFF; new tests cover default ON.

Fresh review covers duplicate sends, interim/error ordering, scope/generation invalidation, account preference ownership, pause/reading preservation, origin policy, async error parsing and OTA compatibility. Existing Nearby/Smart Trip/Memories/navigation/account/PWA suites remain in full regression. The existing 30-second AI race timeout is not cancelled after fast completion (pre-existing P2); no unrelated timer refactor is included.

## Release path — owner approval required

1. Review this isolated branch and exact-SHA CI; no merge/deployment is performed by this task.
2. Authorize deploying only the prepared travel-assistant source to the intended project. Verify OPTIONS from `https://localhost` and normal authenticated call; verify Pages/dev origins and rejected unknown origin. Preserve existing secrets, JWT policy and explicit allowlist.
3. Authorize integration and the existing signed immutable OTA path for this exact Web candidate against installed Native API2. No new APK or native version bump. Check build-info SHA, API compatibility and next-launch update behavior.
4. Lior retests on the existing 2.26.1 APK: auto-send ON (one final request); OFF (edit then Send); cancellation/denial/no speech; close/background/trip/account stale results; Preview and Mate with the same six styles and real voice list; keyboard 360-class viewport; airplane-mode text/TTS fallback; Nearby and main navigation.

This is a candidate prepared for retest, not a claim that the undeployed production CORS failure is already resolved or that new Samsung audio quality was tested.

References: [Android TextToSpeech API](https://developer.android.com/reference/android/speech/tts/TextToSpeech), [Supabase CORS](https://supabase.com/docs/guides/functions/cors).
