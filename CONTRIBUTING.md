# Contributing to whytab

## Before You Start

- Open an issue for behavior changes that affect user data, authentication, sync, backups, or browser permissions.
- Never commit credentials, email addresses, exported backups, screenshots with personal data, `.env` files, or generated production builds.
- Keep data migrations backward compatible. A release must not silently discard or reinterpret existing user data. A deliberately breaking security migration requires a critical release, a raised minimum client version, an explicit release note, and fail-closed old-client behavior.

## Local Verification

Use Node.js 22 or newer, then run:

```sh
npm ci
npm run verify:edge-functions
npm run typecheck
node scripts/migration-safety-test.mjs
npm run verify:repository-safety
npm run verify:public-images
npm run build:web
```

The official hosted build also requires the environment variables listed in `.env.example`. Public Supabase URLs, publishable client keys, and Turnstile site keys are browser-visible; service-role, provider, and deployment tokens are secrets and must stay in the relevant cloud secret store.

## Pull Requests

- Keep unrelated refactors out of the change.
- Describe data compatibility and upgrade behavior.
- Add focused regression checks for changes to sync, account switching, backup restore, URL handling, authentication, and service-worker caching.
- Use sample data only in tests and screenshots.

Security vulnerabilities must follow `SECURITY.md` and must not be disclosed in a public issue or pull request before a fixed release is available.
