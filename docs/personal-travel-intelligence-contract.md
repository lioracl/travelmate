# Personal Travel Intelligence — Data Contract

Status: design contract for the 2.0+ roadmap. No production schema is introduced by this document.

## Ownership

TravelMate must keep one canonical owner for each concept:

- Profile Center owns user identity and user-declared preferences.
- Trip Store / travel_trips.payload remains the canonical trip record.
- TripContext remains the read/normalization boundary for trip-aware client features.
- Trip Replay remains the canonical presentation layer for trip history.
- Trip Analytics is a derived, factual aggregation over existing trip facts.
- Learned Preferences is a derived candidate layer and must never replace declared preferences.
- Mate consumes declared preferences plus only confirmed/eligible learned preferences.
- Supabase Auth remains the identity owner; no duplicate profile identity table is introduced without a demonstrated need.

## Evidence classes

### 1. Observed facts

Facts explicitly represented by TravelMate trip data, for example:

- a place/activity has done=true;
- an item has a trip date/time;
- a user entered an explicit travel duration;
- a trip has a budget/expense record.

Observed facts are not automatically preferences.

### 2. User-declared preferences

Values the user explicitly sets in Profile Center, such as:

- pace;
- activity density;
- transport preference;
- trip style;
- interests;
- Mate learning enabled/disabled.

These have higher authority than learned inference.

### 3. Learned inference

A candidate inferred from eligible, structured trip behavior.

Every candidate must retain:

- preference key/value;
- review state: suggested, confirmed, rejected, deleted;
- confidence;
- evidence references;
- source trip IDs;
- observed timestamps where available;
- created/updated timestamps.

A learned candidate is not a user preference until the user confirms it.

### 4. Sensitive/private data

The learning engine must never infer preferences from:

- document contents or OCR;
- receipts or invoice text;
- passport/visa/identity documents;
- medical or therapy information;
- credentials, vault data or secrets;
- private messages;
- raw location history;
- unrelated account metadata.

Documents remain a separate privacy boundary even when a document belongs to the same trip.

## Cross-trip learning boundary

Cross-trip learning may aggregate evidence only from trips owned by the authenticated user.

Shared-trip membership does not grant permission to use another person's trip activity as evidence for the current user's personal learning.

The current database RLS model supports this boundary: trip owners can create/delete their trips, while shared members can read shared trips through membership policies. Therefore a future learning query must scope evidence by authenticated owner rather than by "all trips visible to the user".

If a future feature intentionally learns from a shared trip, it must use an explicit, separately designed consent model. It must not be an accidental consequence of broad trip visibility.

## Analytics confidence

Trip analytics must expose data quality rather than hide it:

- confirmed: directly entered/recorded by the user or source system;
- estimated: derived from structured data such as coordinates;
- unknown: insufficient data.

Coordinate-derived walking distance is an estimate, not measured walking distance.

Coverage should be available for derived metrics so the UI can avoid implying complete knowledge.

## User controls

Users must be able to:

1. disable learning;
2. review suggested learned preferences;
3. confirm a suggestion;
4. reject a suggestion;
5. delete a learned preference;
6. correct an incorrect inference;
7. eventually remove the evidence that caused an inference where the source is removable.

Deletion must not be implemented as a cosmetic UI hide. The persistence model must prevent deleted/rejected preferences from being exported to Mate.

## Mate consumption

Mate should receive:

- current user identity/addressing data;
- user-declared preferences;
- only eligible learned preferences;
- current trip context;
- factual trip analytics where relevant.

Mate must not receive raw document/private-content evidence merely because a learned preference was requested.

## Avatar/profile boundary

Avatar/photo data belongs to Profile Center, not to a trip and not to learned preferences. A future avatar upload should use user-owned storage with user-scoped access and a stable profile reference.

## Migration rule

Do not add Supabase tables until the client contract is stable and the following are tested:

- RLS ownership;
- cross-trip isolation;
- reject/delete behavior;
- learning disable behavior;
- evidence deletion/recalculation;
- shared-trip exclusion;
- rollback/cleanup.

No destructive migration is authorized by this document.
