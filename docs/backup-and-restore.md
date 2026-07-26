# Encrypted Backup and Restore

This runbook covers the official whytab production database. A backup is valid only when its ciphertext exists outside Supabase and a restore has been tested in a separate project.

## Security Model

- GitHub Actions exports Supabase roles, schema, Auth records, and application data into an ephemeral runner directory.
- The export is compressed and encrypted before upload with a fresh AES-256-GCM data key.
- The data key is wrapped with a 4096-bit RSA recovery public key using RSA-OAEP-SHA-256.
- The private recovery key never enters GitHub, Cloudflare, Supabase, the public repository, or the production build.
- The envelope authenticates its metadata and ciphertext. Decryption also verifies the original byte count and SHA-256 digest.
- Only encrypted envelopes and their ciphertext checksums are uploaded to a private Cloudflare R2 bucket.

This protects backup contents from a compromise of R2 or the upload credential alone. It does not replace Supabase transport encryption, RLS, account deletion, or operator access controls.

## One-Time Setup

1. Enable R2 and create a private bucket dedicated to whytab production backups. Do not enable public access or a custom public domain.
2. Add a lifecycle rule that retains daily backups for 35 days and then deletes them. Do not create longer-lived copies without first updating the public privacy notice and confirming a lawful operational need.
3. Create an R2 S3 credential restricted to object read/write access for only that bucket.
4. Generate the recovery key pair on an operator-controlled encrypted device:

   ```bash
   export BACKUP_KEY_PASSPHRASE='use-a-unique-long-passphrase'
   node scripts/backup-envelope.mjs keygen \
     /tmp/whytab-backup-public.pem \
     /absolute/offline/location/whytab-backup-private.pem
   ```

   The command refuses to place the private key inside the repository. Store the private key and passphrase separately in at least two access-controlled offline locations.

5. Base64-encode the public key, not the private key:

   ```bash
   base64 < /tmp/whytab-backup-public.pem
   ```

6. Add these GitHub Actions secrets:

   - `SUPABASE_ACCESS_TOKEN`: a dedicated, revocable Supabase access token used to initialize a temporary database role. Do not reuse a personal interactive token when a dedicated token is available.
   - `BACKUP_ENCRYPTION_PUBLIC_KEY_B64`: base64-encoded recovery public key.
   - `R2_ACCESS_KEY_ID`: bucket-scoped R2 S3 access-key ID.
   - `R2_SECRET_ACCESS_KEY`: matching R2 S3 secret.
   - `R2_ENDPOINT`: `https://<account-id>.r2.cloudflarestorage.com`.
   - `R2_BUCKET`: private bucket name.

7. Run `Encrypted Production Database Backup` manually once. Confirm the workflow succeeds and the R2 object is private.

The backup workflow limits direct database ingress to the current GitHub runner,
exports through a temporary Supabase login role, and restores a deny-by-default
database allowlist even when the export fails. It does not store the database
password or a PostgreSQL connection string.

Never place an access token, database URL, private recovery key, passphrase, R2 secret, or a plaintext dump in a GitHub issue, workflow artifact, release, repository file, shared chat, or browser download folder.

## Restore Test

Perform this test before public launch and at least once every 90 days:

1. Download one encrypted envelope and its checksum to an encrypted operator device.
2. Verify the ciphertext checksum.
3. Decrypt the envelope locally:

   ```bash
   export BACKUP_KEY_PASSPHRASE='the-offline-key-passphrase'
   node scripts/backup-envelope.mjs decrypt \
     whytab-database.tar.gz.enc \
     whytab-database.tar.gz \
     /absolute/offline/location/whytab-backup-private.pem
   ```

4. Extract `roles.sql`, `schema.sql`, and `data.sql`.
5. Create a separate disposable Supabase project. Never restore over production as a test.
6. Follow Supabase's official CLI restore order for roles, schema, and data. Reconfigure Auth URLs, CAPTCHA, SMTP, Edge Functions, and secrets separately.
7. Verify table counts, a disposable Auth login, one disposable sync snapshot, RLS isolation, and account deletion.
8. Delete the disposable project and all plaintext restore files.
9. Record only the date, source backup ID, restore result, and reviewer. Do not record user emails, snapshot content, credentials, or database URLs.

If production recovery uses a backup containing an account that was deleted after the backup was created, reapply the deletion before reopening production access. Never use a disaster backup to selectively recover an individually deleted account.

## Incident Handling

The backup workflow runs daily and `Report whytab Backup Incidents` opens a `backup-alert` issue after a failed run. A successful later run closes the incident automatically. The operator must keep repository issue notifications enabled.

Treat any of these as a production incident:

- no successful off-site backup within 26 hours;
- an R2 bucket or object becomes public;
- the private key or database URL is exposed;
- envelope integrity validation fails;
- a scheduled restore test fails.

Rotate affected credentials immediately. A leaked private recovery key requires generating a new key pair and re-encrypting retained backups or deleting backups that cannot be protected safely.
