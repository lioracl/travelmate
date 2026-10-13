# Calendar export Phase 1

Export-only vertical slice, based on pinned commit ab14dc23fce23b2a29199e56099946ea5cddcb61.

The existing saved-place calendar action now opens Google/ICS choices. Planned activities expose the same calendar action inside their existing expanded details. Bulk ICS export uses the same isolated model builder.

Only title, entered date/time, validated duration, explicitly stored locationName/address and a generic TravelMate marker are exported. Notes, descriptions, documents, money, identity, preferences, health, messages, receipts, GPS and hidden metadata are outside the allowlist.

Valid YYYY-MM-DD and HH:MM are required. Flexible/free and window aliases are ineligible; fixed/booked/reservation and legacy planned records with exact times remain eligible. Missing duration uses the planner's 60-minute default; invalid explicit duration is rejected. Missing time is never filled during export or saved-place rendering.

DTSTART and DTEND are floating local values, without TZID, UTC suffix or destination/device inference. UTC getters provide civil-date arithmetic only, including midnight rollover. Hebrew copy asks users to confirm calendar timezone before saving/importing.

UTF-8 ICS uses CRLF, text escaping, 75-octet folding, UTC DTSTAMP and a SHA-256 UID from canonical trip/event IDs. No account/private fields enter UID input. For legacy records without an event ID, public event fields provide deterministic fallback identity.

Google receives an encoded template URL only after explicit click. No OAuth, key, SDK, backend, calendar sync or provider request from rendering. Google is disabled offline; local Blob ICS download remains available. Export assets are included in the existing service-worker core cache.

The dialog uses shared modal tokens and controls, native modal semantics, RTL, 44px minimum touch targets, Tab wrapping, Escape and existing history-overlay registration. Closing restores the activity action focus. Export does not write itinerary data or create another store.

## Verification

- Focused Node calendar contracts: 60 passed.
- Full Node suite: 993 passed.
- Focused Playwright: 15 passed, including 360/390/430 light/dark RTL, offline download, privacy, keyboard/focus, touch, no overflow and no calendar/provider request.
- Full Playwright suite: 221 passed; final calendar layout/eligibility changes rechecked in focused tests.
- Syntax checks, diff whitespace, entry/dynamic/core asset existence: passed.
- Read-only distribution classifier: OTA_ONLY. No publication was performed.
- Screenshots reviewed after correcting shared grid styles that fragmented calendar button labels.

Actual Google save and third-party ICS import/timezone interpretation, physical-device testing and native releases are not tested in this slice. Google launch is intercepted in tests to verify the exact template URL without transmitting synthetic data.

Rollback point: ab14dc23fce23b2a29199e56099946ea5cddcb61. Review via Draft PR to preview; do not merge or deploy as part of this task.
