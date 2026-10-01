# Durable Documents recovery verification — PR #141

Branch: codex/documents-storage-lifecycle-20261001. Starting commit: 73e298ea759d2467c29df085a348f5663db43f0c.

Browser cleanup cannot survive process termination between upload and metadata persistence. The new private PostgreSQL journal commits an authenticated owner-bound intent before upload. Storage requires that intent; metadata triggers atomically commit or schedule cleanup. An internal Edge worker uses leases and tokens, rechecks owner/object identity/references, and removes confirmed candidates through the Storage API. It never reads document contents or encryption keys. See [architecture and rollout](../supabase/functions/document-recovery/README.md).

Expired uploads require two stable observations separated by an additional grace period. Missing metadata alone never authorizes deletion. Unknown objects, foreign owners, changed identity and uncertain completion remain ambiguous. Explicit metadata deletion establishes cleanup provenance. No existing orphan is adopted. The logged server journal survives browser termination; recovery runs independently once the scheduler and worker are enabled.

Pass one traced encryption, upload, metadata, cleanup, reconnect, existing policies/migrations and server infrastructure. Pass two checked lost acknowledgments, rollback, expiry, identity changes, legacy clients and token idempotence. Cached clients cannot make new unjournaled uploads. Existing legacy documents remain readable/editable; future explicit deletion may establish cleanup provenance.

Owner RPCs require authenticated identity, existing MFA rules and an expected-owner consistency guard. The private table denies direct access. Security-definer functions have fixed empty search paths and explicit grants/principal checks. Worker RPCs are service-only. HTTP invocation additionally requires a dedicated scheduler secret; recovery is disabled by default. Existing ownership/MFA policies remain effective with an additional restrictive Storage write fence.

Verification: 562 main Node tests plus 25 actual PostgreSQL/PGlite migration tests = **587 passed**. Full Playwright: **32 passed**, including eight document browser flows. JavaScript syntax, Deno frozen type check/lint, assets, whitespace and staged sensitive-content checks passed before commit. Coverage includes process loss, metadata failure, cleanup failure/retry, account change/sign-out, duplicate submissions, reconnect, foreign objects, references, rollback, expiry, stale worker tokens, idempotence and ambiguous completion.

Browser tests use real encryption and synthetic backend responses, with external requests blocked. SQL tests execute the actual migration and original ownership/MFA policies with synthetic accounts/objects in memory. They do not exercise hosted Storage or simultaneous transactions on separate connections.

Only read-only production inspection occurred. No production data, schema, RLS, migrations, Storage objects, secrets or cron jobs were modified. The four known orphan objects were not deleted or migrated. The existing private bucket and 25 MiB limit remain unchanged. Upload quota/provider errors produce no document metadata, display failure and allow retry; durable intent is abandoned or expires. Missing or uncertain objects are retained safely.

Remaining risks: isolated real Storage/API, JWT/MFA and concurrent claim verification; coordinated migration/worker/client rollout; monitoring of backlog, ambiguity and tombstone growth. Production currently lacks this journal/RPC/worker/scheduler, so the new client deliberately fails closed until the migration is available. No authorized isolated hosted stack or local Docker stack was available.

Existing production advisor warnings for authenticated security-definer functions and disabled leaked-password protection were left unchanged. References: [function lint](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [Storage API requirement](https://supabase.com/docs/guides/storage/schema/design).

**Merge readiness: NOT READY** pending isolated provider/concurrency verification and a coordinated rollout plan. No merge or preview deployment occurred.
