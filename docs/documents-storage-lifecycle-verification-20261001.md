# Documents Storage Lifecycle verification — PR #141

Branch: `codex/documents-storage-lifecycle-20261001`; original head: `01db9f7`.

## Two-pass findings

The original 531 Node tests passed. Six new executable regression cases failed
before the fix: account changes during preparation/encryption, rejected metadata
requests, foreign cleanup paths/concurrent queue additions, cleanup of referenced
files, and sign-out after upload. Pass two traced the remaining async boundaries,
delete races, initial session ordering, token refresh, download, retry and limits.

The fix pins operations to their initiating owner/epoch before preparation,
guards continuations, clears metadata/form/passphrase/preview on identity change,
preserves same-owner refresh, and ignores superseded initial session responses.
Record and path ownership are checked on list/open/delete/cleanup. Delete intent
is queued before metadata deletion. Failed cleanup stays owner-scoped and retries
on reconnect or return to that owner. Cleanup checks surviving metadata references,
handles thrown transport errors and preserves newly queued paths. Duplicate upload
submission is blocked. Contract assertions follow the guarded cleanup path and
are supplemented by behavioral coverage.

Document bytes remain AES-GCM encrypted in Supabase Storage. Database rows contain
metadata and salt/IV only. No second document store was introduced.

## Read-only production inspection

The bucket is private, permits encrypted `application/octet-stream`, and limits
each object to 26,214,400 bytes. RLS is enabled on metadata and Storage objects.
Metadata policies require `auth.uid() = user_id`; Storage policies require the
owning first path segment and the private document bucket. MFA policies are
restrictive, so they do not bypass ownership. The metadata schema has no binary
document column. Only schema, bucket settings and policy definitions were read.
No document rows/objects were read or modified; no schema/RLS/migration changes.
Actual cross-account denial was modeled locally rather than exercised in production.

## Quota and user experience

The plaintext limit reserves the 16-byte AES-GCM tag: 26,214,384 bytes. Oversized
files fail before upload. Server size/quota failures stop before metadata insertion,
display inline smaller-file/insufficient-space guidance, and allow retry. Network
errors give connection/retry guidance. Preparation, encryption/upload, success,
failure, removal and pending cleanup use the existing status region. Single-file
failure preserves selection; partial success asks users to reselect failures only.
Offline binaries are not stored locally or automatically replayed.
The existing size display is trip-scoped and its fixed 1 GiB progress denominator
does not represent actual project capacity or available quota.

## Verification

- Full Node suite: 549 passed, including 18 new executable lifecycle cases.
- Focused Documents/storage/account-session/asset contracts passed.
- Playwright: 29 passed, including 5 new lifecycle flows with real encryption,
  synthetic accounts/files, mocked Supabase and external networking blocked.
- All six changed/new JavaScript files passed syntax checks.
- Asset checks cover index/trip pages, stylesheets, service-worker and lazy assets.
- `git diff --check` passed; staged sensitive-content scan completed before commit.

## Remaining blocker

Storage upload and metadata insertion are separate requests. Process termination
after Storage acceptance but before metadata or cleanup intent is recorded can
leave an untracked object. A lost acknowledgement can also race eventual server
completion. Client rollback/reference checks do not make these requests atomic.
Cleanup depends on retained localStorage and returning to the owning account.

Orphan-free recovery after process loss or ambiguous completion is not certified.
An authoritative pending lifecycle/reconciliation design is required to close
that guarantee; production schema/RLS changes are prohibited in this task.
No existing production objects were enumerated or deleted to hide this gap.

Merge readiness: **NOT READY** for the requested complete lifecycle guarantee.
