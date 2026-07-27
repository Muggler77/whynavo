# WhyNavo Configuration and Operations

This document describes how to configure and operate WhyNavo without exposing private credentials or user data.

WhyNavo can be used in two modes:

- Official hosted product: normal users register or sign in at `https://whynavo.pages.dev/` and use the hosted sync service.
- Self-hosted framework: developers fork the repository, provide their own frontend configuration, Supabase project, email delivery setup, and deployment target.

## Local-First Behavior

WhyNavo stores user data in the browser profile first:

- Shortcuts
- Groups and folders
- Dock pins
- Widgets
- Todos
- Notes
- Countdowns
- Appearance settings
- Sync metadata

The app works without login. Signing in only enables cross-device sync.

## Sync Configuration

The app does not expose service URL or API key fields in the user interface.

Normal users do not configure sync infrastructure. They only register or sign in with email and password in the official hosted app.

Frontend sync configuration is injected at build time for the official deployment and for developers who self-host their own copy:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_AUTH_REDIRECT_URL
```

For local development, create an ignored `.env.local` file from `.env.example`.

For the official Cloudflare Pages workflow, configure repository secrets for the Supabase and Turnstile values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TURNSTILE_SITE_KEY`

The workflow fixes `VITE_AUTH_REDIRECT_URL` and `VITE_CAPTCHA_FRAME_URL` to the official Pages origin. Cloudflare deployment also requires the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; the API token must be restricted to Pages write access for the WhyNavo account. `SUPABASE_ACCESS_TOKEN` lets the workflow apply reviewed SQL through the official Management API and deploy versioned Edge Functions without storing a database password or connection string. Direct database ingress remains closed throughout deployment. Backward-compatible sync changes are prepared first; the legacy entry point is revoked only after the replacement Release is public and its update manifest is active.

Do not commit real values to source control.

## Supabase Auth Email Setup

Email verification is controlled in the Supabase project, not in the end-user UI.

Recommended Auth URL settings:

- Site URL: `https://whynavo.pages.dev/`
- Redirect URLs / Additional Redirect URLs: `https://whynavo.pages.dev/`
- Local development redirect URL, if needed: `http://localhost:5173/`

The app passes `emailRedirectTo` during registration. Hosted web builds redirect back to the current web app URL. Extension builds redirect to the public web app so the verification link can complete in a normal browser page.

Recommended sender settings:

- Sender name: `WhyNavo`
- Sender email: use a verified sender/domain that belongs to the project.

The built-in Supabase Auth sender may be used only for restricted administrator testing. Its branded bilingual registration and recovery templates are tracked in `docs/supabase-confirm-signup-email.html` and `docs/supabase-reset-password-email.html`. Both templates use WhyNavo's explicit-click confirmation page so mailbox link scanners cannot consume the one-time token.

Cloudflare's shared `pages.dev` zone cannot be verified as a custom email sender domain. Keep public registration disabled until an owned domain has been verified and Custom SMTP or the audited Send Email Hook in `docs/auth-email-delivery.md` is configured and delivery-tested.

Recommended confirmation email subject:

```txt
Verify your WhyNavo email / 验证 WhyNavo 邮箱
```

Use the full HTML body in `docs/supabase-confirm-signup-email.html`. It includes the public WhyNavo logo at `https://whynavo.pages.dev/icons/icon128.png`, explains why the email was sent, and keeps the wording focused on verifying a sync account. Use `docs/supabase-reset-password-email.html` for recovery messages.

The templates must keep Supabase's `{{ .TokenHash }}` variable unchanged. The token is placed in the URL fragment of `confirm.html`, validated locally, and sent to Supabase only after the user explicitly continues.

## Secret Handling Rules

Never commit:

- Supabase `service_role` key
- Database password
- GitHub token
- SSH private key
- Personal exported shortcut data
- Browser profile data
- Local `.env` or `.env.local` files

The frontend publishable key is not an administrator key, but it is still treated as build-time configuration so the public source code does not expose a specific production project.

## Supabase Tables

The migration creates these tables:

- `shortcut_groups`
- `shortcuts`
- `widgets`
- `todos`
- `notes`
- `countdowns`
- `settings`
- `sync_snapshots`
- `exchange_rate_cache`

User-owned tables have Row Level Security enabled. Each policy checks:

```sql
auth.uid() = user_id
```

This ensures signed-in users can only read and write their own rows.

## Current Sync Model

Current app versions use `sync_snapshots` for full-state sync. The migration also includes finer-grained tables so future versions can move toward per-record sync.

Current clients use account-bound read and write RPCs. The client supplies the account ID of the currently visible local partition, and the database rejects the request unless it exactly matches `auth.uid()`. The database also verifies the JWT session against `auth.sessions` and enforces a 90-day maximum lifetime plus a 30-day inactivity limit for WhyNavo cloud-data access. The older account-unbound write RPC is revoked after the compatible client is live. Published 0.5.x clients temporarily retain direct read permission, but RLS restricts it to the authenticated user's row and invokes the same session-expiry policy.

Sync actions:

- Automatic pull after login
- Automatic push after local edits
- Manual merge sync
- Local overwrite cloud
- Cloud overwrite local
- Local rollback point before overwrite operations

Deletion and conflict handling:

- Deleted records use `deletedAt` markers to avoid old devices restoring removed data.
- Same-record conflicts prefer the newer `updatedAt`.
- Notes can preserve conflict text when two devices edit different content.

## Extension Installation

Build:

```bash
npm install
npm run build
```

Load this directory in Chrome or Edge:

```text
extension/dist
```

## Web App Deployment

The same build can be deployed as a static web app.

The Cloudflare Pages workflow reads the public frontend Supabase configuration and Turnstile site key from GitHub Actions secrets during build, validates them, and publishes only `extension/web-dist`.

## Public Release Checklist

Before making the repository public:

1. Run a repository scan for private project IDs, tokens, SSH paths, personal emails, and exported user data.
2. Verify no `.env` files are tracked.
3. Verify no personal migration JSON files are tracked.
4. Verify Git history has been cleaned or replaced with a clean public history.
5. Run `npm run typecheck`.
6. Run `npm run build`.
7. Apply every migration in `supabase/migrations/` in numeric order and confirm the account-bound sync RPC, RLS policies, table grants, and Edge Function settings remain intact.
