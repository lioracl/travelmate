# Traveler Profile 2.0

## Canonical data and compatibility

The existing Supabase Auth user_metadata.travelmate_preferences object remains the sole profile preference source. Travel pace reuses its existing pace field (legacy active is read as intensive). Seven optional groups live in its additive profile2 object: walking, transport, activeHours, spending, food, spontaneity and exclusions. Missing values are neutral, never inferred. The older single transport field is retained for older consumers; the new advisory helpers use profile2.transport when configured. No database migration, RLS change, provider change, separate profile store or public version bump is required.

The current owner-bound preference update API writes only travelmate_preferences. Avatar/photo metadata, interests and approved learned records remain separate. Disabling learning preserves profile2. Profile 2.0 reset clears pace and the seven new groups only when saved. Closing the editor discards the draft. Offline Auth-cached choices remain readable; writes are disabled and never queued.

## Advisory integrations

Priority: explicit exclusions, current explicit preferences, approved consented learned interests, then neutral defaults. Personalized category lists remove excluded categories. Known long-walk/cost traits suppress recommendations; unknown costs, transport and walking demands are not invented. User-initiated manual searches retain their results, demote excluded known matches and remove personalization badges for them. Food preferences affect category relevance, not dietary certification.

Smart Trip respects active hours and avoids filling short windows for relaxed/planned choices. It never mutates the itinerary. Today Brief reuses the existing Smart Trip explanation without another card or AI/GPS/search request. Existing user-requested Smart Trip AI prompts reuse the canonical preference summary and expressly prioritize exclusions; the provider architecture is unchanged. Local active periods: early morning 05:00–07:59, morning 08:00–11:59, afternoon 12:00–16:59, evening 17:00–20:59, night otherwise.

## Security and limits

Existing scoped Auth writes and owner checks are retained. Pending personalization is invalidated on account/profile changes; UI refresh commits only after request-generation checks. There is no new local persistence. Existing cross-device preference updates retain the established last-write-wins behavior; this feature does not add database CAS. Exclusion keys are bounded to 32 unique safe identifiers and support future categories. Currently the editor exposes six supported exclusions.

Automated tests use controlled local Auth fixtures, not real provider verification. Traveler Profile 2.0 is released to Preview as TravelMate 2.20.0 with canonical asset version 20261006-02. Real phone acceptance remains required before treating the mobile experience as final.
