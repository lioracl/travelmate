# Personal avatar generation (local release candidate)

Dedicated authenticated photo-to-image endpoint; travel-assistant is unchanged.
Server model: gemini-3.1-flash-image via Gemini Interactions REST, store:false,
inline square JPEG, image_size 512. Provider output is bounded to 3MiB/2048px;
the browser decodes, crops/resizes to 512px and compresses to WebP/JPEG <=2MiB.

## Release prerequisites — NOT deployed by this task

Review/apply only the new 20261004220000_avatar_generation_usage.sql migration
and deploy only avatar-generator after explicit release authorization.
Use existing server GEMINI_API_KEY and Supabase-provided server URL/keys.
No browser key, new provider, public source upload or image persistence is used.
Run an authorized real-provider/physical-phone check before release: all six
styles, likeness (including baldness/stubble/age/tone), time/cost, retries, and
selected-image upload/CAS. Local fixture tests do not prove model availability,
provider quality, actual SQL concurrency or deployed Auth behavior.

## Persistent cost guard

Service-only claim/release RPCs receive the owner exclusively from verified Auth.
A transaction-scoped per-owner advisory lock serializes checks across isolates.
Limit: 18 attempts per UTC day, 2 active requests, same-style 30s cooldown.
Attempts consume quota even on provider failure. Three-minute leases recover
from crashed workers; release uses owner/style/claim UUID fencing. Failed release
never clears a successor lease. No image/hash/token is stored in usage rows.
Provider timeout 90s; no automatic provider retry. Browser requests stop at 105s.
Closing cancels browser work; already accepted provider work can still incur cost.

## Privacy / errors

Source remains local until Step 2 requests; normalized bytes go directly to the
function and Gemini. Unselected outputs live only in browser memory, revoked on
source/crop replacement, logout/account change or close. Finish uses only the
chosen generated Blob through the existing guarded Storage/CAS upload.
Gemini store:false disables interaction history; provider processing remains
subject to Google terms and the project's paid/free-tier data policy.
Fixed Hebrew client errors, fixed Edge errors, no payload/provider logging.
Existing static SVG example files are unused legacy examples, never selectable
fallbacks or generated results in this flow.
