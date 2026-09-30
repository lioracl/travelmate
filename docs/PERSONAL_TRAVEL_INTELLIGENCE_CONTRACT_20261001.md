# TravelMate — Personal Travel Intelligence Contract
Date: 2026-10-01
Baseline: GitHub preview at c51ac288d4d9b3aea260b8784dad8d4a8955d0ab
Status: declared-preference foundation implemented through existing Auth metadata; learned-preference persistence remains contract-only

## 1. Purpose
Define ownership and privacy for Personal Travel Intelligence without creating a parallel profile system or prematurely changing Supabase schema.

## 2. Data classes
### A — Observed facts
Directly recorded or measured: destination, dates, itinerary items, explicit completion state, saved places, budget/expenses when reliable, Trip Replay facts.

### B — Declared preferences
Only values explicitly entered or confirmed by the user. Existing trip-level preferences remain trip context until a future Profile Center flow explicitly promotes a value to persistent profile data.

### C — Learned inferences
Future capability; not persisted by this contract. Minimum future record: user_id, key, value, source_type, evidence_ref, confidence, state (proposed/confirmed/rejected/expired), created_at, updated_at, reviewed_at, optional expires_at.
Proposed learned preferences are not sent to Mate as user facts until the user confirms them. Every learned value must support review, correction, deletion, and a user action to clear learned preferences.

### D — Sensitive/private data
Never use document contents, private vault data, credentials/secrets, medical/private notes, raw receipts/private receipt notes, background GPS/location history, or private collaboration content as evidence for personality or preference inference. Do not expand sensitive data collection.

## 3. Profile Center ownership
Current canonical owner is TravelMateUserProfile.fromUser(), providing display name, first name, initials, avatar URL and time-based greeting. Do not duplicate this logic in Home, Mate or trip pages.
Avatar fallback: validated avatar URL -> initials -> display-name text.

Future persistent travel style/pace/preferences must use one canonical Profile Center contract; UI surfaces must not create independent profile state.

## 4. Mate boundary
Mate may consume explicitly declared profile preferences, confirmed learned preferences after a future user-facing confirmation flow, and the existing bounded trip context. Sensitive/private evidence must never enter preference inference.
Trip Replay memory notes and expense line items may be summarized for trip-summary UX, but must not be reused as personality evidence.

## 5. UX
Use Profile Center for persistent settings, Home for concise greeting/context, trip screens for trip-specific personalization, and Mate for contextual suggestions. Prefer inline guidance, useful empty states and progressive disclosure over repeated popups.

## 6. Non-goals
No Supabase table, RLS change, background tracking, sensitive inference, second profile store, visual-system redesign, or silent learned-preference authority.

## 7. Acceptance criteria
1. One canonical profile owner.
2. Declared and learned data remain distinguishable.
3. Every learned value has provenance and confidence.
4. User can review, correct and delete learned values.
5. Sensitive/private data never enters inference.
6. Mate receives an explicit allowlist.
7. Existing Profile Lite and Trip Store APIs remain compatible.
8. Regression tests cover ownership and privacy boundaries.