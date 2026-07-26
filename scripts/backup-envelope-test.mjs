import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decryptBackup,
  encryptBackup,
  generateBackupKeyPair,
  inspectBackup
} from "./backup-envelope.mjs";

const directory = await mkdtemp(join(tmpdir(), "whytab-backup-test-"));
const publicKey = join(directory, "recovery-public.pem");
const privateKey = join(tmpdir(), `whytab-backup-test-private-${process.pid}.pem`);
const input = join(directory, "database.tar.gz");
const encrypted = join(directory, "database.tar.gz.enc");
const decrypted = join(directory, "database-restored.tar.gz");

process.env.BACKUP_KEY_PASSPHRASE = "test-only-passphrase-32-characters";

try {
  const expected = randomBytes(1024 * 1024 + 317);
  await writeFile(input, expected);
  const key = await generateBackupKeyPair(publicKey, privateKey);
  const encryptedResult = await encryptBackup(input, encrypted, publicKey);
  assert.equal(encryptedResult.header.keyFingerprint, key.fingerprint);
  assert.equal(encryptedResult.header.plaintextBytes, expected.length);
  assert.ok(encryptedResult.ciphertextBytes >= expected.length);

  const inspected = await inspectBackup(encrypted);
  assert.equal(inspected.header.algorithm, "RSA-OAEP-SHA256+A256GCM");

  const digest = await decryptBackup(encrypted, decrypted, privateKey);
  assert.equal(digest.bytes, expected.length);
  assert.deepEqual(await readFile(decrypted), expected);

  const corrupted = await readFile(encrypted);
  corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
  const corruptedPath = join(directory, "corrupted.enc");
  await writeFile(corruptedPath, corrupted);
  await assert.rejects(
    decryptBackup(corruptedPath, join(directory, "must-not-exist"), privateKey)
  );

  console.log("Backup envelope encryption, integrity, and recovery tests passed.");
} finally {
  delete process.env.BACKUP_KEY_PASSPHRASE;
  await rm(privateKey, { force: true });
  await rm(directory, { recursive: true, force: true });
}
