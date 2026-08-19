# Privacy and Security

WhyNavo is designed around local-first personal data.

## What Stays Local

Without login, user data is stored in the current browser profile through IndexedDB:

- Website shortcuts
- Shortcut groups and folders
- Widget layout
- Todos
- Notes
- Countdowns
- Theme and appearance settings
- Private photo-frame images, custom wallpaper image data, and dynamic wallpaper video files
- Uploaded shortcut and folder icon image data
- Local photo filenames
- Local sync metadata

This data is not sent to the sync backend unless the user signs in.

## What Syncs After Login

After login, WhyNavo syncs the app state to Supabase so the same account can be used across desktop, phone, and tablet clients.

Cloud sync includes:

- Shortcuts
- Groups and folders
- Widgets
- Todos
- Notes
- Countdowns
- Settings

Private photo-frame images and filenames, inline wallpaper data, uploaded custom wallpapers, dynamic wallpaper videos, and uploaded shortcut or folder icons are deliberately removed from cloud snapshots. Static local media can be moved through a user-created JSON data backup. Dynamic wallpaper video bytes remain in the current browser's IndexedDB and must be selected again on a new device; the export includes only a device-only asset notice, not the video bytes.

Supabase Auth maintains browser-local access and refresh session tokens so a signed-in device can keep its session. WhyNavo does not place those tokens in application state, IndexedDB, exported backups, or synchronization snapshots. Local sign-out removes the current device session; global sign-out revokes the account's refresh sessions. Cloud-data reads and writes also enforce a server-side 90-day maximum session lifetime and a 30-day inactivity limit.

Cloud snapshots are protected by Auth, RLS, account-scoped restore points, optimistic concurrency, a fixed `primary` snapshot name, and a 2 MB server-side payload boundary. Current clients read and write through account-bound authenticated RPCs. During the 0.6.0 transition, published 0.5.x clients may still read only their own row through an RLS policy that enforces the same session-expiry check; the legacy account-unbound write RPC is revoked. Cloud fields are not end-to-end encrypted, so the hosted database operator can technically access synchronized content. Do not place passwords or highly sensitive secrets in notes or shortcut titles.

For registration and password replacement, the browser checks the password before submission by computing its SHA-1 hash locally and sending only the first five hash characters to the free Have I Been Pwned Pwned Passwords range API. Those operations stop if the check fails or finds a known leak. Login first sends the password over HTTPS to Supabase Auth; after successful authentication, WhyNavo performs the same k-anonymous check and shows a warning instead of locking an existing user out when the third-party check is unavailable. The complete password and complete hash are never sent to Have I Been Pwned, padded responses are compared locally, and no result is stored.

## Website Icons

When automatic website icon lookup is enabled, WhyNavo can request icons over HTTPS from the saved website and public favicon providers such as Google, DuckDuckGo, and Simple Icons. Those requests can reveal the requested website hostname to the provider. Plaintext remote icon URLs are rejected. Resolved icon locations are cached per local account partition, and image responses use a bounded browser cache to reduce repeat requests without loading every icon at startup.

Users can disable automatic website icon lookup in Settings. Manually selected local or direct icon images continue to work.

WhyNavo does not include advertising or behavioral analytics SDKs and does not sell user data. Hosting, authentication, CAPTCHA, and email providers can still process operational logs required to deliver and protect those services. The public privacy notice describes retention, deletion, cross-region processing, and the minimum age for a sync account.

Application content in IndexedDB is not additionally encrypted by WhyNavo. Data-at-rest protection therefore depends on the browser profile, operating-system account, device lock, and disk encryption. This limitation is stated explicitly in the public privacy notice.

The repository contains a fail-closed workflow for encrypted off-site disaster
backups, but the public notice must describe that storage as active only after
the private bucket, 35-day lifecycle, offline recovery key, successful backup,
and independent restore test have all been verified. Account deletion removes
online Auth and application rows immediately. Any future disaster-recovery
copy must never be used to selectively restore an individually deleted
account.

Weather uses the city entered by the user. Device coordinates are requested only after the user explicitly enables current-location weather. The selected city, current-location preference, coordinates, and weather responses are cached in the current local account partition, excluded from cloud snapshots and complete backups, and sent only to Open-Meteo for the requested forecast and geocoding operation.

## User Isolation

Cloud data is scoped to the signed-in Supabase user.

The database migration enables Row Level Security for user-owned tables and enforces:

```sql
auth.uid() = user_id
```

That means one user cannot read or write another user's rows through the public client.

Signed-in users can permanently delete their account from the account and sync panel after re-entering the current email address and password and completing a fresh anti-abuse challenge. The server independently verifies the bearer session, current password, one-time CAPTCHA token, account identity, request size, and browser origin before using its private administrative credential. Database foreign keys cascade deletion to cloud snapshots and legacy user-owned rows. The client then removes that account's local state, restore points, migration backups, resolved icon choices, and cached location/weather data from the current device.

Changing a password from an existing signed-in session requires a fresh one-time anti-abuse challenge and a successful Supabase password sign-in for the same account before the new password is submitted. Password-recovery links use a separate, short-lived recovery session and never require or reveal the previous password.

## Credentials and Keys

The source code does not store private production secrets directly.

Build-time variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

The Supabase publishable key is safe to use in browser clients when RLS is configured correctly. It is not a `service_role` key and cannot bypass Row Level Security. The public WhyNavo hosted app includes the browser-visible configuration needed for normal users to register, sign in, and sync.

Never commit:

- Supabase `service_role` key
- Database password
- GitHub token
- SSH private key
- Personal exported user data
- `.env` or `.env.local`

## Defense Layers

- Local-first storage by default
- No login required for local use
- Hidden service configuration in the user interface
- Build-time environment injection for public config
- Supabase Auth for account identity
- Supabase Row Level Security for cloud data
- Local JSON data export and restore for user-controlled backups; dynamic wallpaper video bytes remain device-only
- Account-scoped restore points and migration backups
- Server-revision conflict detection for multi-device writes
- Per-field setting clocks for concurrent settings, widget configuration, and calendar changes
- Tombstones for custom navigation page deletion
- Account-operation cancellation guards during login, logout, and sync
- Client and server 2 MB cloud snapshot limits
- Account-bound snapshot read and write RPCs with server-enforced session limits
- Device-local handling for private photos, custom wallpaper data, and dynamic wallpaper video files
- Bounded external icon caches and explicit local persistence errors
- CSP, HSTS, frame blocking, and browser permission policy on the hosted app
- No tracked personal migration data
- Authenticated account deletion without exposing the server administration key

## Limitations

Browser apps cannot fully hide public client configuration from end users after deployment. Any frontend app that talks directly to Supabase must ship a public project URL and publishable key in the built assets.

Security therefore depends on:

- Never exposing `service_role`
- Correct RLS policies
- Least-privilege database access
- Careful handling of exported user data
- Optional Supabase protections such as email confirmation, rate limits, and CAPTCHA
- Cloudflare Turnstile tokens are single-use and kept only in memory until the Auth request finishes
- Protecting exported backup files, because they can contain the user's complete local dashboard state
