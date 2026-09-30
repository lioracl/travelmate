# TravelMate — Trip Analytics Contract
Date: 2026-10-01
Baseline: GitHub preview at c51ac288d4d9b3aea260b8784dad8d4a8955d0ab
Status: contract-only foundation; reuse existing Trip Replay and Trip Context

## 1. Purpose
Define factual Trip Analytics without creating a competing summary engine or a second distance/time calculation system.

Canonical building blocks:
- TravelMateTripStore
- TravelMateTripReplay
- TravelMateTripContext

## 2. Confidence states
Every metric must be one of:
- confirmed — directly recorded or deterministically derived from trusted trip data
- estimated — calculated from incomplete/assumed data and clearly labeled
- unknown — insufficient reliable data

Never present an estimated value as a measured fact.

## 3. Canonical sources
- trip days: trip start/end
- planned/completed/saved-only: Trip Replay semantics
- memories: Trip Replay memory records
- expenses: trip expense records with currency coverage
- travel-time estimates: TravelMateTripContext.estimateTravelMinutes()
- geographic distance used by itinerary estimates: TravelMateTripContext.distanceKm()

Nearby, Place Auto-Fill and Travel Services may retain discovery/search helpers; they must not become a third Trip Analytics engine.

## 4. Distance and travel time
Coordinate distance is a derived geographic value, not automatically a measured walking route.
Existing Trip Context distinguishes source: manual and source: estimate.
Never label a geographic estimate as measured walking distance, actual route distance, or actual walking time. Without route data, show estimated or unknown.

## 5. Planned vs completed
A saved place without a date is saved-only. A visit is counted only when explicit completion state proves it. Do not infer visits from being saved, being planned, memory notes, geographic proximity, or AI output.

## 6. Initial metric set
Trip duration; planned/completed counts; completion ratio; completed places; saved-only places; memories/attachments; expense count and reliable totals by currency; per-day activity density; estimated travel time; estimated geographic distance where coordinates exist; data coverage/confidence.

Derived labels such as busiest day must expose the defined underlying metric.

## 7. Currency
Do not combine currencies unless a verified conversion source and timestamp are available. Otherwise report per-currency totals and mark a consolidated total unknown.

## 8. Privacy and UX
No background GPS tracking, document-content inspection, personality inference from private notes, proximity-based visit inference, or second persistent analytics store without a separate architecture decision.
Start with a compact factual summary and reveal methodology progressively.

## 9. Acceptance criteria
1. Reuses Trip Replay semantics.
2. Reuses Trip Context travel-time/distance helpers.
3. Every metric has confirmed/estimated/unknown state.
4. Saved-only places are never counted as visits.
5. Mixed currencies are not falsely consolidated.
6. Missing coordinates/time produce unknown or explicitly estimated results.
7. No background location collection.
8. No second analytics store without a separate architecture decision.
9. Tests cover duplicates, missing coordinates, mixed modes, timezone boundaries and partial data.