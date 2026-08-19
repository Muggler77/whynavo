# Production Readiness

This document defines the release gates for the official WhyNavo service. A source build or successful static deployment alone is not a production launch.

## Required Release Gates

- `npm ci`, type checking, migration safety tests, repository safety tests, raster-image metadata scanning, complete public-history scanning, production configuration validation, full dependency audit (including build tooling), extension build, and web build all pass from a clean checkout.
- Cloudflare Pages deployment uses an account-owned API token restricted to Pages write access. The token and account ID exist only in encrypted GitHub Actions secrets.
- The production Turnstile widget permits only the official web hostname. Its site key is public build configuration; its secret exists only in Supabase's encrypted Auth configuration.
- Supabase email confirmation is enabled. Sign-up, sign-in, password recovery, signed-in password changes, and account deletion are protected by Turnstile and server-side rate limits.
- Registration, login, and replacement passwords are checked against Have I Been Pwned by sending only a five-character SHA-1 prefix with padded responses. Registration and replacement fail closed; login is authenticated first and then shows a warning for a leaked password or an unavailable check so a third-party outage cannot lock every existing user out. If Supabase's server-side leaked-password protection is unavailable, this remains a client-enforced mitigation rather than an equivalent backend control.
- A production transactional-email sender on an operator-owned domain is authenticated with SPF and DKIM, has a DMARC policy, and has passed inbox and junk-folder tests with at least two unrelated mailbox providers.
- All database migrations are applied in order, and `boc-rates`, `delete-account`, and `send-auth-email` are deployed with the documented authentication settings.
- The release workflow completes local checks, prepares backward-compatible database changes and Edge Functions, and passes the production predeployment gate before building and storing the matching installation artifact in a private draft Release. The first Pages deployment switches and smoke-tests the app while preserving the already-public update manifest and a compatibility wrapper for published 0.5.x clients. The workflow then publishes the verified Release, atomically activates its update manifest, smoke-tests that public path, revokes the retired write API, and repeats final production checks. A failed rollout never revokes the old-client API before the replacement archive is public.
- Release preparation, production deployment, and encrypted backup share one non-cancelling concurrency group so database access restrictions and schema cutovers cannot overlap.
- Revoking the account-unbound write RPC is an intentional security cutover. Version 0.5.7 retains session-bound read compatibility until it encounters a 0.6.0 snapshot's minimum-version marker, then stops syncing safely; older clients that used the retired write API are rejected. Local data remains intact. Hosted clients refresh to upgrade, while unpacked-extension users install and reload the 0.6.0 release.
- Security cutovers must be split into a backward-compatible preparation migration and a post-client revocation migration. A failed frontend deployment therefore leaves the published client functional instead of stranding it between incompatible backend versions.
- A real test account passes sign-up, confirmation, sign-in, password recovery, two-device concurrent synchronization, local sign-out, global sign-out, account deletion, and post-deletion sign-in rejection.
- A successful encrypted off-site database backup exists from the last 26 hours. Only ciphertext is uploaded, the private recovery key remains offline, the R2 bucket is private, and a restore test has passed in a separate disposable project within the last 90 days. Follow `docs/backup-and-restore.md`.
- The public repository contains no personal export, private environment file, server credential, local filesystem path, retired endpoint, or personal author email in any reachable revision.
- The public repository includes an explicit license, operator identity, public privacy contact, security contact, and jurisdiction-appropriate privacy and terms text reviewed by the operator.
- Extension releases are distributed through a trusted update channel. Unpacked Chrome or Edge extensions are testing installs and do not receive automatic updates.
- Availability, Auth health, final migration state, function versions, database privileges, Security Advisor results, closed direct database ingress, and the public Edge Function are checked hourly. A failed monitor run automatically opens or updates a `production-alert` issue and closes it after recovery. The repository operator must keep GitHub issue notifications enabled and separately review email-provider delivery failures.
- Scheduled production monitoring, database backups, release publication, and Pages deployment remain disabled until the repository variable `WHYNAVO_PRODUCTION_ENABLED` is set to `true`. Manual monitoring and backup runs stay available for pre-launch validation; release and deployment runs stay fail-closed. Enable the variable only after every gate in this document has passed, so incomplete setup cannot create misleading production incidents or a partial public release.

## Data Safety Acceptance

- Anonymous, signed-in, and cached offline data occupy separate local partitions.
- Cross-tab Auth account changes persist the outgoing partition and activate the incoming account before any further synchronization.
- Local sign-out is broadcast to every open WhyNavo tab in the same browser profile; each tab persists its pending edits before hiding the account partition, including when Auth is offline.
- If the outgoing account partition cannot be written because browser storage is unavailable or full, WhyNavo cancels the account transition, keeps the visible content in memory, and asks the user to export a complete backup instead of exposing or overwriting another partition.
- Concurrent same-account tabs merge inside one IndexedDB write transaction and converge through a lightweight local notification instead of overwriting the full local snapshot.
- Anonymous data is adopted exactly once after sign-in and cannot be adopted by another account.
- Account activation is committed only after cloud data is loaded and validated; failure restores the previous local state.
- Cloud writes use optimistic revision checks and conflict retry instead of blind replacement.
- Cloud writes are limited per account in the database so a valid session cannot issue unbounded large snapshot writes.
- Cloud reads and writes are bound to the account ID expected by the visible local partition; an in-flight Auth account change fails closed in both the client and database.
- Cloud reads and writes verify the Auth session in the database and enforce a 90-day maximum lifetime plus a 30-day inactivity timeout per device session.
- Restore points, update backups, icon caches, weather caches, and migration backups are account scoped.
- Private photos, uploaded icons, filenames, custom wallpaper image data, dynamic wallpaper video files, weather city, and current-location preference stay on the device and are excluded from cloud snapshots. Dynamic wallpaper video bytes are also excluded from JSON data backups and must be selected again on a new device.
- Full JSON backup includes the complete supported app state and clearly warns that the file can contain private content.
- Password-protected account deletion is verified by the server and removes cloud data plus the current device's account partition.

## Known Service Boundaries

- Synchronized text and settings are protected by authentication, row-level security, and transport encryption, but are not end-to-end encrypted. The database operator can technically access them.
- Browser IndexedDB is scoped to the web origin and browser profile. Local-only data does not automatically move between unrelated domains, browsers, or profiles.
- Multi-device merge is record and field based, with conflict copies for competing note bodies. It is not a collaborative real-time editor.
- Public frontend configuration is visible in browser assets by design. Security depends on never exposing administrative keys and on enforcing RLS and restricted server functions.
- The Supabase Free Plan is not an accepted large-scale production tier: it currently provides a 500 MB database, 5 GB monthly egress, no automatic backups, and can pause low-activity projects. A broad traffic campaign requires a paid production plan or an equivalent reviewed backend, active capacity alerts, and the independent encrypted backup procedure.

## Release Evidence

For each public version, retain:

- the Git commit and signed or verified tag;
- the GitHub Actions run links;
- the release ZIP, SHA-256 file, and build provenance attestation;
- the Cloudflare deployment identifier;
- the applied Supabase migration list and function versions;
- the end-to-end test timestamp and test account deletion confirmation;
- the backup restore-test timestamp.
