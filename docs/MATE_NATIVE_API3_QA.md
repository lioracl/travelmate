# Native voice endpoint candidate 2.27.0 / 22700 / API 3

Base: d80d9909e78ffdca831251b514d1a54f11e9118a. Isolated branch codex/mate-voice-actions-native-20261015.

Evidence: API 2 ignores beginning/end-of-speech and disables partial results. It only finalizes when the provider returns onResults. Physical Samsung requires explicit stop; provider-specific cause cannot be established without a device trace.

API 3 forwards speech/end/finalizing signals. End-of-speech schedules one stop request after 350ms. If end is omitted but partial text changes, 2200ms without a changed partial requests finalization. Partial text is never emitted or promoted to a final result. A 30s session cap and 6s finalization timeout release resources and return an error without sending. Cancel, pause, destruction and replacement clear both timers. The unchanged canonical web controller owns UI and auto-send.

Limit: providers can omit both end and partial callbacks. Such a session times out safely rather than manufacturing text. Long pauses can trigger finalization. Samsung endpoint timing requires physical retesting.

TTS keeps safe 0.8–1.2 rate/pitch bounds. setVoice must both return SUCCESS and report the requested effective Voice. Deterministic fallback tries Hebrew, then other installed local voices. Capability metadata includes default/current voice, locale, quality, latency, network requirement and installed data. speak returns requested/effective voice and rate/pitch acceptance; SUCCESS does not prove audible prosody. No recorder, audio files, transcript telemetry, cloud TTS, permissions or signing key changes.

Runtime API 3 / minimum web API 3 blocks incompatible signed bundles before download. Existing API 2 rejects API 3. Embedded web must be staged from the exact reviewed web SHA. Keep the accepted OTA classifier baseline unchanged. No publication, deployment, signing or device installation is authorized by this candidate.

Verification: JVM endpoint policy tests plus full Node native contracts, Gradle check/lint/Java compilation. Instrumentation sources compiled, not executed. Physical Samsung not tested.

References: https://developer.android.com/reference/android/speech/RecognitionListener and https://developer.android.com/reference/android/speech/RecognizerIntent . Android documents provider-dependent partial callbacks and cautions against arbitrary silence intent extras; none are added.
