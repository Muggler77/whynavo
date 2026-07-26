# whytab Release Data Safety

User data is local-first and must survive extension updates without user action. A release is blocked if any item below fails.

## Required Checks

1. Run the migration safety test:

```sh
node scripts/migration-safety-test.mjs
```

2. Run type checking and production build:

```sh
npm run typecheck
npm run build
```

3. Verify the built `extension/dist/manifest.json` version matches `extension/public/manifest.json`.

4. Verify `extension/dist/latest-version.json` exists and matches the intended published version.

5. Confirm the local unpacked-extension directory has been synced from `extension/dist`.

6. Confirm GitHub `main` matches the authoritative local release commit.

7. If the sync protocol changed, prepare a backward-compatible server API first, build the verified client into a private draft Release, deploy and verify the hosted client, then apply a separate migration that revokes the retired API. Publish the draft only after final production checks pass. Run two-device concurrent-write tests.

8. Confirm private local media, weather city, current-location preference, coordinates, and weather responses are absent from cloud snapshots; confirm complete export/import round-trips supported user content while intentionally preserving device-local weather choices.

9. Confirm `extension/dist` contains no Cloudflare-only `_headers` file or other hosting-control file that Chrome rejects.

10. Run `npm run build:web` separately and confirm only `extension/web-dist` contains `_headers`.

11. Confirm the Cloudflare Pages deployment job fails when any required Cloudflare, Supabase, or Turnstile Secret is absent and completes its actual deploy and production smoke-test steps when all are present.

12. Confirm stale login or sync operations cannot update state after logout or account switching.

13. Confirm every Supabase migration is applied, all three Edge Functions match `supabase/config.toml`, CAPTCHA is enabled, and public Auth email uses a verified sender domain.

14. Open two tabs for the same local account, save different records at nearly the same time, and confirm both tabs converge without console errors or missing records.

15. Delete a disposable test account with two tabs open. Confirm both tabs immediately show the anonymous partition, all account-scoped caches are removed, and a delayed save from either tab cannot recreate the deleted partition.

## Data Safety Rules

- Never delete or rewrite local user data during an update without first creating a backup.
- Keep `manifest.version`, `APP_VERSION`, and `latest-version.json` aligned for every public release.
- Keep `DATA_SCHEMA_VERSION` separate from app version.
- If a future cloud snapshot has a higher data schema than the current client supports, stop sync and ask the user to upgrade.
- If a migration changes data shape, add a test fixture that proves shortcuts, folders, todos, notes, countdowns, settings, and sync metadata survive.
- If new extension permissions are added, treat the release as higher risk because browser stores may require users to accept the permission before updating.
- Apply migrations through `0012_rate_limit_sync_writes.sql` before the 0.6.0 client deployment. These create and rate-limit the account-bound RPC without disabling the currently published client. After the Pages deployment succeeds, immediately apply `0013_retire_unbound_sync_rpc.sql` and run the production Supabase gate. Unsupported clients then fail closed without creating an avoidable deployment outage.
- Prepare the verified extension artifact as a private draft only after the backward-compatible migrations and Edge Functions are ready. Switch the hosted `latest-version.json`, retire the old API, and pass production smoke tests before publishing the draft. Ordinary `main` pushes and failed rollouts must not expose a downloadable version whose cloud cutover is incomplete.
- Keep local uploaded media out of cloud snapshots and preserve it during pull or merge operations.
- Enforce the cloud snapshot payload boundary in both the client and database function.
- Merge ordinary local saves inside one IndexedDB read-write transaction; a same-account tab must never replace another tab's newer records with an unmerged whole-state write.
- Cancel sign-out and account switching if the outgoing partition cannot be written. Keep the current content visible so the user can export a complete backup instead of discarding in-memory edits.
- Install the deleted-account marker in the same IndexedDB transaction that removes account data. Every account write path must reject a marked user ID before stale tabs can recreate it.
