# Mate Sprint A+B architecture and release boundary

Base: 53c52aae1454f20e010b08893937cffff8df0bd9 (#168), native pin 623ae0ef2d6a655368f2be704a4ccdef8924b7af unchanged. Preview e8513167165b0363a497199e83e176c868173923 verified on GitHub before work. New isolated branch codex/mate-brain-actions-v2-20261015. Production Edge v11 is user-reported; no deployment or production reads/writes required.

## Evidence and ownership decisions (before implementation)
- ai-assistant.collectTripContext sends activities and savedPlaces separately; only activities have mutation IDs. app.js renders savedPlaces with date in the Plan. Removing a scheduled place must clear schedule and preserve the saved object.
- sendMessage loses input origin and never invokes canonical Voice after a successful answer. Carry request-scoped origin; speak only a current successful voice response after processing ends, once. Typed input remains silent. No native change required.
- TripStore.updateTrip rereads canonical data and queues existing sync. Reuse it; never persist snapshot or introduce a new sync owner.
- mate-trip-snapshot owns the privacy-safe read contract. Stable source-prefixed planItemId maps to sourceType/sourceId. Timeline includes activities and scheduled savedPlaces; unscheduled places stay in savedPlaces. Bounded payloads report omitted counts explicitly. Exclude documents, receipts, GPS, auth, notes and private attachments. Screen is an allowlisted hint only.
- Extend mate-actions, retaining V1 compatibility. Strict action/argument allowlist, full live identity validation, owner/account/trip/lifecycle fences, explicit confirmation, bounded guarded Undo. Only owned collections are patched onto latest canonical state. Source fields/order are restored exactly; unrelated Budget/Memories remain untouched.
- add_expense must use Budget's existing owner, whose form currently owns validation/persistence/receipt lifecycle. Do not introduce a parallel expense writer; expose an owner adapter only if it can preserve those invariants, otherwise intentionally deferred.
- Local open_screen uses existing TravelMateHistory.navigate and a fixed screen allowlist. No model URLs.
- Edge V2 is opt-in; V1/legacy/receipt behavior and exact CORS/JWT remain unchanged. Source only; no production deployment.
- No Conversation Mode, spoken destructive confirmation, background listening, new TTS controller, migration or native bump in this sprint.

## Acceptance
Focused snapshot/action/voice/security tests per increment; full Node and zero-retry Playwright before completion. Mobile RTL360/390/430 light/dark and keyboard shrink. Fresh review after tests. Physical Samsung remains untested until owner acceptance. Native API3 remains required by the inherited candidate, not newly introduced here.

Continuation evidence and Design V3 preparation are recorded in MATE_FUNCTIONAL_FREEZE_HANDOFF.md. The candidate remains A+B only; new full-suite and exact-SHA CI evidence must gate Sprint C.
