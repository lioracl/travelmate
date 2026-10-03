# TravelMate — Flexible Trip & Contextual Nearby Roadmap

## Product principle
TravelMate should help the traveler make decisions without turning the trip into a task manager. Time is context, not authority. The user decides when an activity starts, ends, is skipped, or is replaced.

## Implementation status — TravelMate 2.10.0

Contextual Nearby V1 is implemented in Places and Mate. It is user-invoked, calculates the free-time window against the next fixed commitment, asks for GPS consent only after activation, reuses the existing Nearby pipeline, bounds suggestions to six time-feasible places, and keeps Navigate / Save / Add to today as explicit user actions. Mate recognizes explicit nearby/free-time requests locally and does not send GPS coordinates to Gemini. Opening hours are not claimed unless independently verified.

Mood/category shortcuts, Mate integration, and optional Mini Route are now implemented on the same contextual contract. Mini Route is user-invoked only, evaluates at most six nearby candidates, prefers 2–3 time-feasible stops, falls back from three to two when needed, and never saves or schedules a stop automatically. Fixed Event Reminders V1 is also implemented as an explicit per-event opt-in with a 45-minute default. Remaining future work in this family: reliable push delivery while the app is closed, richer live routing data, and more reliable opening-hours signals.
## Timing model (future additive fields)
No schema migration is required for the current Plan UX pass. When this model is implemented, add nullable fields so old trips keep working:

- `scheduleMode`: `flexible` | `window` | `fixed`
- `timeWindowStart` / `timeWindowEnd` for preferred windows
- `durationEstimate` as an estimate, never an automatic completion deadline
- optional day-level override: `dayMode`: `flexible` | `balanced` | `scheduled`

### Flexible
Order and approximate time are suggestions. No "late" state and no automatic advance to the next activity.

### Window
The activity is preferred within a time range. TravelMate may gently surface the window, but it does not treat the first minute as an appointment.

### Fixed
Reservations, transport, tours, shows, timed tickets, or anything with a real commitment. Here TravelMate may calculate departure time, buffer, travel-time risk, and conflicts.

## Day behavior
TravelMate may infer a day tone from explicit timing modes, but the traveler can override it.

- Flexible day: mostly flexible activities.
- Balanced day: a mix of flexible and fixed items.
- Scheduled day: several fixed commitments.

Even on a scheduled day, TravelMate never marks an activity complete or moves the user forward automatically.

## Gentle nudges
Notifications must be opt-in and proportional to commitment.

- Fixed: "Your booked museum starts in 45 minutes."
- Window: "You planned to visit the market this afternoon."
- Flexible: no lateness language and no nagging by default.

## Transition-time intelligence
Future phase:
- Multimodal Travel Intelligence V1 implemented in 2.11.0: explicit/auto travel modes and mode-aware estimates for walking, cycling, public transport, train, driving and taxi; live public-transport/rail/driving providers remain future work.
- configurable safety buffer before fixed bookings
- detect an unrealistic sequence without blocking it
- explain the reason: "This leaves only 8 minutes to reach the booked tour."

## Contextual Nearby Suggestions — user invoked only
Entry point in Places: **"Find something to do near me"**.

The flow must request location only after the user asks. It must not background-track location.

Inputs:
- current location supplied after permission
- available time, either user-entered or calculated until the next fixed activity
- distance/travel-time radius
- time of day
- categories or mood ("quiet", "food", "view", "shopping", "culture")
- opening state when reliable
- already-saved places and current itinerary

Outputs:
- a small ranked set of realistic nearby options
- why each option fits the available time
- distance / travel time
- actions: Navigate, Save, Add to today
- optional mini-route of 2–3 stops only when the user asks for it — implemented in 2.8.0 with bounded distance-based travel estimates and safe fallback to fewer stops

TravelMate should never silently insert a nearby recommendation into the itinerary.

## Mate integration
Examples:
- "Mate, I have two free hours here. What is worth doing?"
- "Find something quiet within 15 minutes."
- "I have a booking at 18:00 — what can I do before it?"

Mate now calls the same contextual-nearby contract rather than inventing a separate recommendation path. Requests without a duration derive the window from the next fixed commitment; when no such commitment exists, the existing editable window is shown. Meta, translation, writing, and negated prompts stay on the normal Mate/Gemini path.

Six shared intent presets are available in Places and understood by Mate: food, coffee, quiet, culture, view/scenic, and shopping. Each preset maps to existing Places category keys; it changes only the search scope and explanatory context, never GPS consent, persistence, or scheduling behavior.

Mini Route uses the same explicit contextual request. It accounts for travel from the current position, travel between stops, and onward travel to the next fixed commitment when coordinates are available. The route is advisory: estimates are not live navigation, opening hours are not assumed, and the user must explicitly save or schedule any stop.

## Technical seam created in this branch
`assets/trip-context.js` is a side-effect-free helper layer. It:
- normalizes future schedule modes
- classifies a day only from explicit timing metadata
- finds the next fixed activity
- calculates a free-time window with a buffer
- builds a nearby-request context from a position supplied by the caller
- can evaluate a bounded 2–3 stop Mini Route without side effects

It does **not** request geolocation, create timers, send notifications, or mutate trip data.

## Later UX backlog
1. Quick Add: time + title first, details on demand.
2. Swipe actions on mobile only after conflict testing with horizontal gestures/maps.
3. Transition-time suggestions.
4. Opt-in fixed-event reminders.
5. Travel-time conflict warnings.
6. Contextual Nearby Suggestions — V1 in 2.6.0, Mood shortcuts in 2.7.0, Mini Route in 2.8.0; next: richer live routing/opening-hours signals.
7. Day-mode controls and per-activity Flexible / Window / Fixed editing.
