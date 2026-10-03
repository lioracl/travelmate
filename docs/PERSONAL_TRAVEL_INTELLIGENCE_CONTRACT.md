# Personal Travel Intelligence — Data Contract

Status: Contract-first foundation for TravelMate 2.4.x
Baseline: preview `c51ac288d4d9b3aea260b8784dad8d4a8955d0ab`
Scope: Profile Center, explicit preferences, learned preferences, Mate personalization, cross-trip learning, and Trip Analytics.

## 1. Existing ownership

- Authenticated identity and display profile remain owned by Supabase Auth user metadata and the existing `TravelMateUserProfile` helper.
- Trip data remains owned by `TravelMateTripStore` and persisted/synchronized through the existing Cloud Sync path.
- Trip Replay remains the factual trip-history presentation layer.
- `TravelMateTripContext` remains the shared distance/travel-time calculation layer.
- `travel_documents` remains private document/vault data and is outside the learning source boundary.
- No parallel profile, preference, replay, or analytics store is introduced by this contract.

## 2. Data classes

### A. Observed facts

Facts directly recorded or measured by TravelMate.

Examples:
- trip/activity/place exists
- activity or place has `done=true`
- user-created memory exists
- expense was recorded
- explicit travel time was supplied
- coordinates exist for a place
- a route/time value was produced by an existing calculation

Observed facts may be aggregated for Trip Analytics.

### Multimodal travel facts — implemented in 2.11.0

- Activities may optionally store an explicit `travelMode`: `walk`, `bike`, `transit`, `train`, `drive`, or `taxi`.
- `auto` means no factual mode was stored. TravelMate may infer a mode for an estimate, but that inference remains labeled `inferred`.
- An explicit/manual travel duration remains authoritative even when coordinates are missing.
- Trip Analytics may aggregate explicit/manual mode facts into a per-mode breakdown; inferred modes must not become cross-trip learning evidence.
- V1 is mode-aware estimation only. It does not claim live public-transport, rail, taxi, or driving data. Existing Contextual Nearby live walking routing remains a separate explicit-location feature.
- No additional GPS permission, passive location collection, background tracking, or schema migration is introduced by Multimodal V1.

### B. Declared preferences

Preferences explicitly entered or confirmed by the user.

Examples:
- preferred travel pace
- preferred trip style
- interests
- preferred transport
- preferred activity density
- food preferences

A declared preference is authoritative until the user changes or deletes it.

Trip-level `trip.preferences` is not automatically a cross-trip user preference. It may be promoted only after explicit user confirmation.

### C. Learned inferences

Non-sensitive hypotheses derived from permitted behavioral evidence.

Every learned item MUST contain:
- stable id
- preference key
- value
- provenance/evidence references
- confidence
- createdAt
- updatedAt
- reviewState
- source scope
- correction/deletion state

Recommended review states:
- `suggested`
- `confirmed`
- `rejected`
- `deleted`

Learned inference must never silently become a declared preference.

### D. Sensitive/private data

Never use these as sources for personality or preference inference:
- document contents
- private document notes
- vault data
- credentials
- medical/private notes
- raw receipt/document text
- private collaboration messages unless explicitly brought into the current user request

GPS is not a passive learning source. Location may be used only for an explicit feature invocation and only under the existing consent model.

## 3. Profile Center ownership

Profile Center must read/write the existing authenticated profile owner.

Allowed profile identity fields:
- display name
- first-name presentation derived from display name
- avatar URL when supplied by an existing trusted auth provider
- initials fallback
- Mate addressing preference, once explicitly defined

Do not create a second profile table or second identity object.

Avatar upload is a separate future storage task because the current Supabase storage inventory has only the private `travel-documents` bucket. Do not reuse the document bucket for avatars.

## 4. Preference contract

Use two explicit namespaces:

`declaredPreferences`
- user-controlled
- editable
- deletable
- no confidence score required
- small values may live in the existing authenticated user's `user_metadata` rather than a new profile table
- must never be used for authorization or security decisions

`learnedPreferences`
- system-generated suggestion
- evidence-backed
- confidence-scored
- reviewable
- correctable
- deletable
- should not be stored in `user_metadata` once provenance, evidence, cross-trip querying, review history, or deletion dependencies are required

A trip-local preference must remain trip-local unless the user explicitly promotes it.

## 5. Mate context boundary

Mate may receive:
- current trip identity and destination
- non-sensitive itinerary facts
- completed/planned state
- saved places
- bounded budget/expense aggregates
- declared preferences that the user has allowed for personalization
- confirmed learned preferences that are allowed for personalization

Mate must not receive:
- document contents
- receipt text
- vault data
- credentials
- private notes
- raw GPS history
- rejected/deleted learned preferences

Every future personalization context builder must apply this boundary before prompt construction.

## 6. Trip Analytics contract

Every metric must carry:

`value`
`unit`
`status`
`source`
`coverage`
`confidence`

Allowed status values:
- `confirmed`
- `estimated`
- `unknown`

Examples:
- Completed visits from `done=true`: confirmed.
- Haversine/route-derived distance: estimated unless a measured route source exists.
- Explicit travel duration entered by the user: confirmed.
- Missing coordinates: unknown.

Never label coordinate-derived estimates as measured walking distance.

Trip Analytics must reuse Trip Replay and TravelMateTripContext rather than create another distance/time engine.

## 7. Cross-trip learning

Cross-trip learning may consume only:
- confirmed trip facts
- explicit declared preferences
- allowed non-sensitive behavioral signals

It must not consume private documents or sensitive/private text.

A cross-trip inference must retain evidence references to the source trips/events that produced it, subject to the user's deletion controls.

Deleting a source event must invalidate or reduce confidence in dependent learned inferences.

## 8. User controls

The user must be able to:
- see declared preferences
- see learned preferences separately
- see why a learned preference was suggested
- confirm it
- reject it
- correct it
- delete it
- disable learning/personalization
- delete all learned preferences

UX should prefer inline/contextual guidance and progressive disclosure over repeated blocking popups.

## 9. Implementation gate

Before adding a new Supabase table:
1. prove that the existing Auth `user_metadata` cannot safely satisfy the declared-preference requirement;
2. if learned preferences require durable provenance/querying/review history, define a dedicated table only for learned intelligence rather than duplicating the profile;
3. define the exact RLS ownership model using `auth.uid()`;
4. define deletion/cascade behavior;
5. define migration and rollback strategy;
6. add contract tests;
7. verify against the existing Cloud Sync and Trip Store boundaries.

Until these are proven necessary, keep the foundation contract-only.
