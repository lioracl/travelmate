# Mate Voice + Actions 2.27.0 QA candidate

Web base: e8513167165b0363a497199e83e176c868173923 (Preview verified from GitHub). Native base: d80d9909e78ffdca831251b514d1a54f11e9118a. New native pin: 623ae0ef2d6a655368f2be704a4ccdef8924b7af. Worktrees are under C:/Projects/TravelMate/.worktrees/mate-voice-actions[-native]-20261015. Root user changes preserved; no OneDrive access.

## Root causes and boundaries
- Native API2 ignored beginning/end-of-speech, requested no partial callbacks, and relied entirely on the provider returning onResults. The web auto-send setting already existed and waited for final result plus end. Samsung provider endpoint behavior cannot be conclusively diagnosed without physical traces; no claim that numeric/mock tests prove it fixed.
- The native engine was asked for rate/pitch but acceptance/effective voice were hidden. API2 limited rate/pitch to 0.8–1.2. No evidence proves Samsung clamps/ignores these. API3 retains safe bounds and reports acceptance, requested/effective voice, local/network inventory, quality, latency and default. No fake speaker identities.
- Mate omitted canonical activity IDs and had no structured action response, confirmation or canonical mutation/Undo path.

## Implemented flows
Mic tap → canonical mate-voice → Android provider → RecognitionSession/native callbacks. End schedules one stop after 350ms; changing partial text schedules a 2200ms fallback if end is absent. Only final onResults emits transcript, then end. Auto-send ON sends once; OFF focuses an editable draft. Second tap cancels. Errors, stale scope, close, navigation and background never send. Partial transcript is never emitted or stored. Providers omitting both end and partial signals time out safely. Samsung timing remains physical acceptance.

Settings → account-scoped preferences → same provider/style for Preview and Mate. Real local voices remain selectable independently of style. Settings diagnostics include actual native voice and parameter acceptance, not private IDs/audio. Sentence pauses: Auto180ms, Calm650ms, Friendly300ms, Professional220ms, Energetic60ms, Clear450ms. Pending pause cancels on lifecycle changes. Rate/pitch acceptance does not establish audible engine compliance.

Client opts into actionsVersion:1. Edge returns {answer, actions:[{type:'remove_activity', activityId, requiresConfirmation:true}]}, at most one action. Existing clients and receipt extraction retain their response behavior. IDs must belong to provided context; malformed/unknown/ambiguous actions are discarded. Duplicate titles require unique time/date. Model prose for a valid proposal is replaced with deterministic proposal text; no success before execution.

Client independently validates against both sent context and full live canonical activities. The user must press the actual Remove button. TripStore.updateTrip rereads latest canonical data; only activities change, preserving newer Budget/Memories. Same account, owner, trip, activity identity, full activity revision and lifecycle must hold. Read-only/shared trips are deliberately not editable in V1. Cancel does nothing. Exact activity/order can be restored for five minutes within unchanged activity/account/trip context. Canonical queue and activities-updated events remain the sole write/sync path. Offline means local save with existing sync queue, not claimed cloud completion.

## Distribution and release gate
APK_REQUIRED: versionName2.27.0 / versionCode22700 / Native API3, minimum web API3. Existing 2.26.1 API2 must not receive this candidate via OTA. Signed compatibility tests reject new-on-old and old-on-new before downloading, permit matching API3 once, preserve rollback blocking and embedded fallback. Accepted classifier OTA baseline stays81ff06343c49b9a395661f54bfc873a3ccb85644.

Edge source change is REQUIRED for actions, NOT deployed. Exact allowlist including https://localhost, unknown-origin403, unauthenticated401 and JWT policy unchanged. Production v10 remains untouched. No merge, Pages deployment, OTA publication, signing, APK publication or device installation performed.

## Verification and limitations
Full Node, full zero-retry Playwright, native Node, JVM tests, Gradle check/lint, instrumentation compilation, JS/MJS syntax, assets/PWA, whitespace and privacy scans are required; exact final totals recorded in the completion report/CI. Browser/native-provider tests are SIMULATED/MOCKED. JVM tests exercise native endpoint timing policy; Android instrumentation was compiled but NOT executed. Real Gemini action quality, Samsung audio/recognition and TalkBack are PHYSICAL DEVICE NOT TESTED.

Fresh review additionally fenced duplicate IDs/titles outside the truncated model context and disabled stale action controls. No new action persistence owner or voice controller. Remaining acceptance: provider-specific endpoint/silence behavior and perceptual style separation. Shared-trip editing, voice confirmation and cloud TTS are outside V1. Existing unrelated Android lint warnings and AI request timeout timer cleanup are P2 follow-up.

## Owner retest
After explicit release authorization: build/sign QA with existing permanent identity from exact web/native SHAs; deploy reviewed Edge function; install/update QA APK manually. Check one mic tap → speech → silence → one message with auto-send ON; OFF must permit editing. Check cancel, denial, no-speech, network loss, close, background, trip/account switch and stale callbacks. In Settings inspect actual Hebrew voices/effective selection; compare the long Calm/Professional/Energetic preview and Stop. Ask to remove an exact activity, verify no change before touch confirmation, cancel, confirm, Undo, duplicate-title clarification and stale/read-only rejection. Recheck keyboard/RTL at360/390/430, Nearby, Smart Trip and Memories. Do not call production-ready before physical acceptance.

References: Android RecognitionListener/RecognizerIntent documentation; Google Gemini structured-output documentation; Supabase CORS documentation. No production data used in tests.

Local verification before commit: Node1188/1188; complete browser suite317/317 retries0 plus final combined action suite12/12 after adding the318th case. Exact-SHA CI reruns all318. Native Node940/940; Gradle check/lint and Java compilation passed; JVM34/34 executions (17 unique tests across debug/release), instrumentation0 executed. Syntax230 JS/MJS files passed. Visual review corrected RTL date/time with bdi. Existing native lint26 warnings,0 errors.
