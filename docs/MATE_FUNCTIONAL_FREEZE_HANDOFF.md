# Mate A+B functional freeze / Design V3 handoff

## Provenance and scope
Recovered, not recreated: C:/Projects/TravelMate/.worktrees/mate-brain-actions-v2-20261015, branch codex/mate-brain-actions-v2-20261015. Starting HEAD 53c52aae1454f20e010b08893937cffff8df0bd9 (#168). Preview e8513167165b0363a497199e83e176c868173923; native dependency 623ae0ef2d6a655368f2be704a4ccdef8924b7af (#167), unchanged. The branch was local-only at recovery. No root workspace or OneDrive access, reset, deployment, database mutation, signing or installation.

Web QA version 2.28.0; assets 20261016-01; CACHE_SCHEMA remains v266. Native dependency remains 2.27.0 / 22700 / API 3. Distribution remains APK_REQUIRED relative to installed API 2. Signing continuity is a distribution gate, not a reason to redesign functional owners.

## A+B capability boundary
- IMPLEMENTED + TESTED (automated): remove_plan_item, add_plan_item, move_plan_item, update_plan_item, mark_completed, add_saved_place_to_plan; local open_screen via TravelMateHistory.navigate. Explicit touch confirmation, five-minute guarded Undo, canonical identity/revision/account/owner fences. No model-controlled URL, function or database operation.
- INTENTIONALLY DEFERRED: add_expense. Budget validation, FX provenance and persistence remain in trip-experience.js; no suitable existing public expense creation adapter was found. Mate must not write expense arrays.
- UNSUPPORTED SAFELY: deleting a saved object rather than unscheduling it; modifying lodging/base or arrival/departure anchors through generic Plan actions; shared/read-only/conflicted trips; malformed canonical collections.
- Sprint C NOT STARTED in this A+B commit. No automatic follow-up listening, barge-in session, spoken confirmation, wake word or offline-engine claim. Existing deterministic navigation is reusable.

## Snapshot and ownership
TravelMateTripStore is the source, read immediately before invoking the assistant. No DOM-derived truth or persistent snapshot owner. Activities plus scheduled Saved Places form a source-prefixed timeline; unscheduled places remain separately available. Each list is bounded to 200, with omission/corruption metadata. Edge removes legacy duplicate activities and enforces a 60,000-character context bound. Schedule aliases match TripContext. Device-local date/time and timezone are explicitly not guaranteed destination-local. Base/arrival/departure identities are distinct.

Budget includes original-currency totals and EUR budget metadata, without invented FX conversion. Documents are excluded without an approved metadata contract; Memories without explicit consent; coordinates, receipts, private attachments and arbitrary trip fields are excluded. No account identifier is sent in ownership metadata; only ownership/read-only flags.

Plan activities-updated refreshes its canonical mirror and baseline. Mate Saved Place actions emit existing activities-updated and places-updated domain events; Places rereads its mirror and baseline. Overview already observes canonical local-trips-updated. canonical-trip-replaced retains cloud/replacement semantics and is never emitted as a generic local mutation. Budget/Memories retain existing delta-write owners and replacement handling. Mate mutations and Undo preserve unrelated newer Budget/Memories data.

Reproduced and fixed: Plan rendering crashed when canonical dayNotes was absent; Saved Place Undo did not refresh its owner mirror; stale aiNotes whole-trip saves reverted newer Plan/Budget changes. aiNotes now uses saveTripFields with an explicit baseline and field allowlist, preserving concurrent new notes. Archive reads filter by current owner before resolving a trip ID; colliding IDs cannot expose another account's archive.

Smart Trip's domain-specific transaction code remains its owner. Mate extends the existing Actions V1 controller and guarded transaction principles instead of introducing a third transaction framework.

## Voice and lifecycle
One TravelMateVoice controller, one account-scoped settings owner. Final recognition can auto-send; a second tap cancels. Only successful voice-origin requests may auto-speak once, after processing clears, when autoSpeakReplies and voice are enabled. Typed/restored conversations remain silent. Setting is default-on and independently persisted per account; disabling it leaves manual reading available.

Reproduced delayed-answer speech after native background or trip change, and obsolete sending after close/reopen during client acquisition. Request route, account, generation and panel lifecycle fences now reject these. Native lifecycle cancellation is forwarded by the existing Voice controller; no competing voice state machine. Preference changes and close/navigation cancel active playback. Speech provider/recognition behavior remains simulated in automated browser tests; no physical Samsung or TalkBack claim. Screen-reader users can disable automatic reply speech; hardware announcement interaction still requires acceptance.

## Edge and release boundary
EDGE CHANGE REQUIRED: supabase/functions/travel-assistant/index.ts adds opt-in actionsVersion 2 snapshot and six-action validation. Legacy/V1/receipt paths remain supported. Unknown actions/fields/IDs are rejected; model actions never execute remotely. Valid action proposals replace premature completion prose. Exact https://localhost CORS entry, other explicit origins and JWT policy remain unchanged. Deployed: NO. Production version 11 is user-reported and is not evidence for this new V2 contract.

The isolated QA workflow adds only this branch to the existing trigger, with contents: read. It runs full Node/Playwright (zero retries) and checks the exact native dependency, stages the exact web SHA, compiles Java and runs Gradle check. It does not sign, publish or install an APK. Final run IDs and exact counts belong in the completion report; old #168 CI is not reused.

## Verification coverage and limits
Focused tests include 32 V2 action cases, snapshot privacy/coverage/aliases/corruption, Edge/client schema parity, aiNotes concurrency/account isolation, manual Plan/Places saves after Mate Undo, local navigation and Back, voice final/cancel/error races, automatic speech once, delayed lifecycle invalidation and preference isolation. Full repository gates cover Plan, Nearby, Smart Trip, Budget, Memories, Documents, offline/navigation, settings and inherited native contracts.

Browser matrix: Hebrew RTL 360/390/430, light/dark, viewport shrink and existing VisualViewport/native-inset tests. These are simulations, not a physical IME. Focus/ARIA/reduced-motion contracts remain; real TalkBack and acoustic differentiation are NOT TESTED. Live Gemini/Edge/cloud/reconnect provider acceptance is separate from mocked automated tests.

## MUST PREPARE BEFORE DESIGN RESET
- Authority: assets/styles.css -> theme.css -> shared/feature sheets; app.js loader deliberately keeps readable-glass.css last. Inventory also trip-redesign.css, app-shell.css, ai-assistant.css and weather-widget.css. No CSS change or new !important in A+B.
- Verified individual !important counts: styles 0, theme 14, readable-glass 94, trip-redesign 30, ai-assistant 14, weather-widget 0, app-shell 0. These seven files total 152. The supplied core baseline 159 has a different unspecified file set; do not substitute historical 286. The explicit 16-file inventory in design-system-debt-contract plus ai-assistant/app-shell totals 178; compare identical file sets only.
- Deliberately replace final-authority/load-order assertions in design-system-debt-contract.test.js, mobile-visual-polish-contract.test.js, documents-v2-visual-contract.test.js and weather-v2-visual-contract.test.js. Review design-correction, android-no-white-pass6, surface-themes-pass7, theme-system and cold-start-hardening tests. Rewrite for approved V3 semantics, never bypass.
- Theme migration: one base visual system + user accent + destination hero; preserve light/dark and account preference ownership. Retire material families via explicit migration, not a final override sheet.
- SW: bump all versioned entrypoints together; retain lazy assistant/account/features, offline cold start, stale-cache pruning and matching HTML/CSS. Snapshot is lazy-loaded in the assistant dependency sequence, not imported at Overview startup.
- Preserve data attributes/IDs consumed by Plan/Places, confirmation and automation; inventory before changing markup. Keep focus, 44px targets, RTL, reduced motion, live-region ownership and keyboard/safe-area behavior.

## SAFE DURING SCREEN MIGRATION
Recommended sequence: tokens/shared components and AppShell; Overview/Hero/avatar; Plan; Places; Budget/Documents via Overview/More; Mate voice-state presentation; Profile Hero; New Trip wizard. Use opaque cards, genuine dark mode, destination imagery chiefly in Hero, preserved Weather animations, reduced-motion support. Bottom Nav is Overview | Plan | MATE | Places | More; remove competing primary floating Mate presentation only during that reviewed migration. Do not implement these changes in A+B.

## DO NOT CHANGE WITHOUT DOMAIN REVIEW
TravelMateHistory (including overlay/system-Back policy), TripStore ownership, Budget persistence/FX, account/session owner, Voice controller, Smart Trip transactions, Learned Preferences consent. AppShell already moves/syncs the profile avatar into Trip Hero; preserve that owner, SystemBars and safe-area handling.

## Roadmap / reusable analytics
A+B is snapshot/actions/confirmation/Undo/lifecycle. Sprint C before Design Reset is Conversation Mode Lite with explicit start/end, bounded follow-up, tap-to-barge-in, proposal-bound yes/no and honest offline capability. V3 changes presentation. Sprint D is proactive/replanning/weather/routing/summary/journal orchestration; not included. Learned Preferences remain a separate consented, approved and still-valid capability. Interpreter/full offline STT/vocabulary bias/Gemini Live remain later optional work.

trip-analytics.js already provides completed activity/place counts, daily and trip totals, expense aggregates, route points, coverage, and walk/bike/drive/taxi/transit/metro/rail breakdowns. It explicitly marks distance/path as estimated or unknown and distinguishes manual time. Completed coordinates are not GPS history, mode inference is not measured transport use, and there is no trustworthy health step feed. Preserve these provenance labels; no fabricated telemetry or new analytics collection.

## PHYSICAL SAMSUNG / PRODUCTION ACCEPTANCE
Separate gates: microphone endpoint behavior; audible Hebrew engine/style behavior; TalkBack; real IME; certificate continuity/upgrade; actual offline recognition; live provider quality; approved Edge deployment; approved release. No signing, OTA, APK installation, production mutation or deployment occurred in A+B. A green code gate is not production-ready or hardware acceptance.
