# Personal avatar generation

Dedicated authenticated photo-to-image endpoint; `travel-assistant` / Mate is unchanged.
The avatar provider is Cloudflare Workers AI using `@cf/black-forest-labs/flux-2-klein-4b` through the direct REST API. The browser never receives Cloudflare credentials.

## Provider / free-tier contract

Required server-only secrets:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with Workers AI read/write permission

The function sends multipart/form-data to:
`POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`
with `prompt`, `width=512`, `height=512`, and binary `input_image_0`.
The generation source is normalized to 511x511 because Cloudflare documents reference images as smaller than 512x512. Returned model image data is bounded/validated and the browser performs the existing final 512px normalization before saving.

Cloudflare Workers AI Free includes a daily free Neuron allocation. TravelMate does not enable a paid fallback or alternate paid provider. If Cloudflare rejects work because quota/capacity is exhausted, avatar generation fails safely; Mate remains unaffected.

## Persistent usage guard

Service-only claim/release RPCs receive the owner exclusively from verified Supabase Auth.
A transaction-scoped per-owner advisory lock serializes checks across isolates.
Limit: 18 attempts per UTC day, 2 active requests, same-style 30s cooldown.
Attempts consume TravelMate quota even on provider failure. Three-minute leases recover from crashed workers; release uses owner/style/claim UUID fencing. Failed release never clears a successor lease. No image/hash/token is stored in usage rows.
Provider timeout 90s; no automatic provider retry. Browser requests stop at 105s.

## Privacy / errors

Source remains local until Step 2 requests; the normalized source goes directly to the authenticated Supabase function and then to Cloudflare Workers AI. Unselected outputs live only in browser memory and are revoked on source/crop replacement, logout/account change or close. Finish uses only the chosen generated Blob through the existing guarded Storage/CAS upload.

Provider auth/configuration, quota/capacity and temporary provider failures are mapped to fixed safe errors. Provider response bodies, prompts, account IDs, user IDs, images and tokens are never logged or returned to the browser.
Existing static SVG example files remain unused legacy examples, never selectable fallbacks or generated results.

## Release check

Before release, verify the two Cloudflare secrets exist in hosted Supabase, deploy only `avatar-generator`, then perform one authenticated live generation before asking for all six styles. Confirm Free-plan behavior and visual likeness on a real device. Do not change `travel-assistant`.
