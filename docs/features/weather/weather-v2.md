# Weather 2.0

## Purpose

Weather gives a traveler a compact destination forecast on Overview and a readable seven-day view without competing with the trip Hero or hiding the destination photo.

## Actors

- Traveler: checks current conditions and the seven-day forecast, refreshes it, and can ask Mate for trip-planning advice.
- TravelMate client: resolves the destination, fetches and caches forecast data, and presents loading, success, and retry states.
- Open-Meteo: provides geocoding and forecast data.

## Functional requirements

- **FR-WEA-001:** For a custom trip, show the compact Weather card as a sibling immediately after the Hero.
- **FR-WEA-002:** Show the destination, current temperature, condition summary, and a control for opening the full forecast.
- **FR-WEA-003:** Show seven daily forecasts with condition, high/low temperature, precipitation probability, and maximum wind speed.
- **FR-WEA-004:** Let the traveler refresh while preserving retry and cached-fallback behavior.
- **FR-WEA-005:** Let the traveler send a weather-focused planning prompt to Mate.
- **FR-WEA-006:** Keep Open-Meteo attribution visible and linked.
- **FR-WEA-007:** Close by control, backdrop, or Escape; trap focus while open and restore it to the launcher on close.
- **FR-WEA-008:** Present loading and recoverable error states with retry.

## Non-functional requirements

- Use a neutral translucent compact surface with no backdrop blur, black glass, or theme-color slab.
- Provide at least a 44px touch target for interactive controls.
- Keep the closed custom-trip card approximately 72–82px high on mobile.
- Keep all seven days readable at 390px and 430px with no horizontal overflow.
- Derive light and dark appearance from semantic design tokens.
- Use one modal surface and flat divided rows rather than nested decorative cards.
- Preserve keyboard, focus, retry, cache, and attribution behavior.

## Data sources and caching

TravelMate currently uses Open-Meteo's geocoding endpoint when destination coordinates are unavailable and its forecast endpoint for current conditions plus seven daily forecasts. A successful geocoding result is cached in browser `localStorage` by normalized city and country. Forecasts are cached by rounded latitude and longitude for 15 minutes. The forecast request retries once after a short delay; if it still fails, an existing cached forecast may be used.

No additional API or persisted application schema is introduced by Weather 2.0.

## Privacy

The destination city/country or destination coordinates are sent to Open-Meteo as needed for a forecast. Weather does not use health data or other personal data. Browser-local forecast and geocoding caches remain on the device.

## External integration

- Open-Meteo Geocoding API resolves a destination name when coordinates are unavailable.
- Open-Meteo Forecast API supplies current conditions and seven daily forecasts.

## Required diagrams (later)

- Context diagram: Traveler, TravelMate, Mate, and Open-Meteo.
- DFD: destination lookup, local browser cache, forecast retrieval, and rendering.
- Sequence diagram: initial load, cache hit/miss, retry, refresh, and Ask Mate.

## User-guide seed

### Open the forecast
On a custom trip's Overview, activate the Weather card below the Hero.

### Refresh
Use **רענון / Refresh** in the dialog to request fresh data.

### Understand the metrics
Each row shows condition, high and low temperatures, precipitation probability, and maximum wind speed. Today receives a subtle highlight.

### Ask Mate
Use **שאל את Mate על התחזית** for route or packing suggestions.

### Troubleshooting
If the forecast does not load, confirm connectivity and use retry or refresh. TravelMate may show a cached forecast when a live request fails. If the destination is wrong, verify the trip's destination details.

## Traceability seed

| Requirement | Component | Data/Integration | Test area |
|---|---|---|---|
| FR-WEA-001 | weather-widget.js | custom trip Hero placement | weather material/placement contracts |
| FR-WEA-003 | weather-widget.js | Open-Meteo daily forecast | weather behavior contracts |
| FR-WEA-004 | weather-widget.js | local cache + refresh | weather behavior contracts |
| FR-WEA-005 | Weather modal | TravelMateEvents askAi | weather behavior contracts |
| FR-WEA-007 | Weather modal | focus/Escape state | accessibility contract |
| FR-WEA-008 | Weather modal | loading/error/retry states | weather behavior contracts |
