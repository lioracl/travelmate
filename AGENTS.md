# TravelMate repository guidance

## Verification

- Run JavaScript syntax checks for every changed JavaScript file before committing.
- Verify that `index.html`, trip pages, stylesheets, and dynamically loaded assets exist.
- For user-facing changes, test the relevant flow in the local preview when available.
- Scan staged changes for secrets, credentials, personal documents, and generated databases.

## Git workflow

- `origin/preview` is the source-of-truth integration base; `preview` is the automatic integration and deployment branch.
- Before each new task, inspect user changes, fetch `origin preview`, and verify the task base against the exact `origin/preview` SHA. Never start from a stale local `preview`.
- If freshness cannot be verified, report the limitation before dependent work. Reconcile without reset, clean, force-push, overwrite, or discarding user changes.
- Preserve unrelated user changes and do not include them in task commits.
- After a user-requested change passes verification, create a concise descriptive commit and push it to `preview` unless the user explicitly asks not to push.
- Never push directly to `main` without the user's explicit approval. Never force-push or rewrite published history.

## Distribution

- Ordinary HTML/CSS/JavaScript, PWA/service-worker, tests, documentation, and backend work is OTA-first. Do not rebuild or reinstall the native shell for routine web work.
- Run `node tools/classify-distribution.mjs` before release. `OTA_ONLY` may use the existing signed Preview OTA path; `APK_REQUIRED` must remain blocked from OTA publication.
- Do not edit Android/iOS projects, Capacitor/native configuration, native bridges/plugins, permissions, resources, or native compatibility metadata unless the task explicitly requires native work.
- A native-shell release is a separate explicit task. Only after its compatibility acceptance may the classifier OTA baseline be advanced.
- Preserve the existing OTA contract: signed immutable bundles, exact SHA stamping, safe next-launch/explicit refresh, no unsolicited mid-session reload, and no local-data clearing.

## Sensitive data

- Never commit `.env` files, API secrets, signing keys, personal travel documents, uploaded files, GPS histories, or local databases.
- GitHub stores source code and deployment files only. User documents belong in private cloud object storage.

## Deployment

- GitHub Pages deploys automatically from `preview` through `.github/workflows/deploy-pages.yml`.
- Keep all deployed paths relative so the app works under `/travelmate/`.
- Treat `main` as the stable production branch for later store releases.

## App versioning

- Keep the user-facing version and release notes in `assets/about.js` current for every user-facing release.
- Use semantic-style numbering: patch fixes increment the third number, meaningful features increment the minor number, and deep or incompatible product changes increment the major number.
- Update the About highlights when a release materially changes the product.
