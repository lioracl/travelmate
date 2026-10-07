# TravelMate 2.20.3 — Release Verification

Date: 2026-10-07
Runtime asset token: `20261007-01`
Hardening commit: `667b62b4c4d3c58707eb9fd3088bbd84e6669aae`

## Scope

This release hardens account lifecycle isolation and the encrypted document lifecycle while preserving the existing V2 UX and PWA behavior.

## Evidence

- Node regression: **746 / 746 PASS**.
- Playwright lifecycle E2E: **13 / 13 PASS**.
  - account A → B state replacement
  - stale Mate success/error rejection
  - stale Mate continuation rejection
  - Trip Intelligence account isolation
  - pending memory upload isolation
  - sign-out/sign-in state isolation
  - receipt scan stale-result rejection
  - Document upload/session isolation
  - late metadata completion isolation
  - owner-scoped delete cleanup retry
  - upload-limit retry behavior
- Local RC smoke: **5 / 5 PASS**.
  - 390 light/dark
  - 430 light/dark
  - reduced-motion
  - no horizontal overflow
  - custom trip shell without page errors
- GitHub Actions run `37565098910`:
  - Verify: PASS
  - JavaScript syntax: PASS
  - Regression tests: PASS
  - Required files: PASS
  - Deploy GitHub Pages: PASS
- Live GitHub Pages:
  - `assets/app.js?v=20261007-01` observed
  - 390/430 light/dark: HTTP 200, RTL, no horizontal overflow, no page errors
  - offline reload after Service Worker activation: PASS
- Repository gates:
  - local SHA matched remote before change
  - `git diff --check`: PASS
  - version synchronization: PASS
  - stale asset token scan: PASS
  - secret-value heuristic: no findings
  - local `preview` clean and synchronized after push

## Confirmed bugs fixed

1. A delayed Mate session/request from account A could complete after switching to account B.
2. A → B → A could allow an old same-ID account generation to look current without a generation fence.
3. Budget/Memories fallback state was not fully owner-partitioned.
4. Document upload/open/delete async completion was not fully bound to the account/session that initiated the operation.
5. Late auth/session callbacks could restore stale UI/state in several flows.

## Deferred / non-blocking

- A durable server-side cleanup journal for orphan encrypted document blobs is not part of 2.20.3. Current cleanup is owner-scoped and retryable on the client; a server journal remains a future hardening option.
- Supabase Auth leaked-password protection is currently not enabled. Enabling it changes authentication behavior and should be a deliberate production decision.
- Codex review was unavailable because the locally configured model was rejected for the connected ChatGPT account. This was treated as an external tooling issue; automated/runtime gates completed independently.

## Production boundary

`main` was **not** modified. Production promotion requires explicit approval.
