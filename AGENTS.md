# TravelMate repository guidance

## Verification

- Run JavaScript syntax checks for every changed JavaScript file before committing.
- Verify that `index.html`, trip pages, stylesheets, and dynamically loaded assets exist.
- For user-facing changes, test the relevant flow in the local preview when available.
- Scan staged changes for secrets, credentials, personal documents, and generated databases.

## Git workflow

- Use `preview` as the automatic integration and deployment branch.
- After completing a user-requested change and passing verification, create a concise descriptive commit and push it to `preview` unless the user explicitly asks not to push.
- Never push directly to `main` without the user's explicit approval.
- Never force-push or rewrite published history.
- Preserve unrelated user changes and do not commit files outside the requested scope.

## Sensitive data

- Never commit `.env` files, API secrets, signing keys, personal travel documents, uploaded files, GPS histories, or local databases.
- GitHub stores source code and deployment files only. User documents belong in private cloud object storage.

## Deployment

- GitHub Pages deploys automatically from `preview` through `.github/workflows/deploy-pages.yml`.
- Keep all deployed paths relative so the app works under `/travelmate/`.
- Treat `main` as the stable production branch for later store releases.

