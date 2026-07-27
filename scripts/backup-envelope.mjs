import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  appendFile,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("WHYNAVO-ENCRYPTED-BACKUP-V1\n", "ascii");
const FORMAT = "whynavo-encrypted-backup";
const FORMAT_VERSION = 1;
const ALGORITHM = "RSA-OAEP-SHA256+A256GCM";
const MAX_HEADER_BYTES = 64 * 1024;
const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;

const asBase64 = (value) => Buffer.from(value).toString("base64");
const fromBase64 = (value, label) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`${label} is not valid base64`);
  }
  return Buffer.from(value, "base64");
};

const publicKeyFingerprint = (key) => {
  const publicKey = key.type === "public" ? key : createPublicKey(key);
  const der = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
};

const aadFields = (header) => ({
  format: header.format,
  version: header.version,
  algorithm: header.algorithm,
  createdAt: header.createdAt,
  keyFingerprint: header.keyFingerprint,
  encryptedKey: header.encryptedKey,
  iv: header.iv,
  plaintextBytes: header.plaintextBytes,
  plaintextSha256: header.plaintextSha256
});

const canonicalAad = (header) => Buffer.from(JSON.stringify(aadFields(header)), "utf8");

async function hashFile(path) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest("hex") };
}

const temporaryPath = (path) => `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;

const readPublicKey = async (path) => {
  const encoded = process.env.BACKUP_ENCRYPTION_PUBLIC_KEY_B64;
  const value = path
    ? await readFile(path)
    : encoded
      ? Buffer.from(encoded, "base64")
      : undefined;
  if (!value?.length) {
    throw new Error("Provide a public-key path or BACKUP_ENCRYPTION_PUBLIC_KEY_B64");
  }
  return createPublicKey(value);
};

const readPrivateKey = async (path) => {
  if (!path) throw new Error("Provide the offline private-key path");
  return createPrivateKey({
    key: await readFile(path),
    format: "pem",
    passphrase: process.env.BACKUP_KEY_PASSPHRASE
  });
};

const validateHeader = (header) => {
  const allowed = new Set([
    "format",
    "version",
    "algorithm",
    "createdAt",
    "keyFingerprint",
    "encryptedKey",
    "iv",
    "authTag",
    "plaintextBytes",
    "plaintextSha256"
  ]);
  if (
    !header
    || typeof header !== "object"
    || Array.isArray(header)
    || Object.keys(header).some((key) => !allowed.has(key))
    || header.format !== FORMAT
    || header.version !== FORMAT_VERSION
    || header.algorithm !== ALGORITHM
    || typeof header.createdAt !== "string"
    || !Number.isFinite(Date.parse(header.createdAt))
    || !/^[a-f0-9]{64}$/.test(String(header.keyFingerprint || ""))
    || !Number.isSafeInteger(header.plaintextBytes)
    || header.plaintextBytes < 0
    || !/^[a-f0-9]{64}$/.test(String(header.plaintextSha256 || ""))
  ) {
    throw new Error("Backup envelope header is invalid");
  }
  const encryptedKey = fromBase64(header.encryptedKey, "encryptedKey");
  const iv = fromBase64(header.iv, "iv");
  const authTag = fromBase64(header.authTag, "authTag");
  if (encryptedKey.length < 128 || iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Backup envelope cryptographic fields are invalid");
  }
  return { encryptedKey, iv, authTag };
};

export async function inspectBackup(inputPath) {
  const handle = await open(inputPath, "r");
  try {
    const input = await handle.stat();
    if (!input.isFile() || input.size <= MAGIC.length + 4) throw new Error("Backup envelope is empty");
    const magic = Buffer.alloc(MAGIC.length);
    await handle.read(magic, 0, magic.length, 0);
    if (!magic.equals(MAGIC)) throw new Error("Backup envelope magic is invalid");

    const footer = Buffer.alloc(4);
    await handle.read(footer, 0, footer.length, input.size - footer.length);
    const headerLength = footer.readUInt32BE(0);
    if (headerLength < 2 || headerLength > MAX_HEADER_BYTES) {
      throw new Error("Backup envelope header length is invalid");
    }
    const headerStart = input.size - footer.length - headerLength;
    if (headerStart <= MAGIC.length) throw new Error("Backup envelope has no ciphertext");

    const encodedHeader = Buffer.alloc(headerLength);
    await handle.read(encodedHeader, 0, headerLength, headerStart);
    const header = JSON.parse(encodedHeader.toString("utf8"));
    validateHeader(header);
    return {
      header,
      ciphertextStart: MAGIC.length,
      ciphertextEnd: headerStart - 1,
      ciphertextBytes: headerStart - MAGIC.length,
      envelopeBytes: input.size
    };
  } finally {
    await handle.close();
  }
}

export async function encryptBackup(inputPath, outputPath, publicKeyPath) {
  const source = await stat(inputPath);
  if (!source.isFile() || source.size < 1) throw new Error("Backup input must be a non-empty file");

  const publicKey = await readPublicKey(publicKeyPath);
  const digest = await hashFile(inputPath);
  const dataKey = randomBytes(32);
  const iv = randomBytes(IV_BYTES);
  const header = {
    format: FORMAT,
    version: FORMAT_VERSION,
    algorithm: ALGORITHM,
    createdAt: new Date().toISOString(),
    keyFingerprint: publicKeyFingerprint(publicKey),
    encryptedKey: asBase64(publicEncrypt({
      key: publicKey,
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING
    }, dataKey)),
    iv: asBase64(iv),
    plaintextBytes: digest.bytes,
    plaintextSha256: digest.sha256
  };
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(canonicalAad(header));

  const temp = temporaryPath(outputPath);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  try {
    await writeFile(temp, MAGIC, { mode: 0o600 });
    await pipeline(createReadStream(inputPath), cipher, createWriteStream(temp, { flags: "a", mode: 0o600 }));
    const completeHeader = {
      ...header,
      authTag: asBase64(cipher.getAuthTag())
    };
    const encodedHeader = Buffer.from(JSON.stringify(completeHeader), "utf8");
    if (encodedHeader.length > MAX_HEADER_BYTES) throw new Error("Backup envelope header is too large");
    const footer = Buffer.alloc(4);
    footer.writeUInt32BE(encodedHeader.length);
    await appendFile(temp, Buffer.concat([encodedHeader, footer]));
    await rename(temp, outputPath);
    await chmod(outputPath, 0o600);
    return inspectBackup(outputPath);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    dataKey.fill(0);
  }
}

export async function decryptBackup(inputPath, outputPath, privateKeyPath) {
  const envelope = await inspectBackup(inputPath);
  const privateKey = await readPrivateKey(privateKeyPath);
  if (publicKeyFingerprint(privateKey) !== envelope.header.keyFingerprint) {
    throw new Error("The private key does not match this backup");
  }
  const { encryptedKey, iv, authTag } = validateHeader(envelope.header);
  const dataKey = privateDecrypt({
    key: privateKey,
    oaepHash: "sha256",
    padding: constants.RSA_PKCS1_OAEP_PADDING
  }, encryptedKey);
  const decipher = createDecipheriv("aes-256-gcm", dataKey, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAAD(canonicalAad(envelope.header));
  decipher.setAuthTag(authTag);

  const temp = temporaryPath(outputPath);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  try {
    await pipeline(
      createReadStream(inputPath, {
        start: envelope.ciphertextStart,
        end: envelope.ciphertextEnd
      }),
      decipher,
      createWriteStream(temp, { mode: 0o600 })
    );
    const digest = await hashFile(temp);
    if (
      digest.bytes !== envelope.header.plaintextBytes
      || digest.sha256 !== envelope.header.plaintextSha256
    ) {
      throw new Error("Decrypted backup integrity check failed");
    }
    await rename(temp, outputPath);
    await chmod(outputPath, 0o600);
    return digest;
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    dataKey.fill(0);
  }
}

export async function generateBackupKeyPair(publicPath, privatePath) {
  if (!publicPath || !privatePath) throw new Error("Provide public and private key output paths");
  const passphrase = process.env.BACKUP_KEY_PASSPHRASE || "";
  if (passphrase.length < 16) throw new Error("BACKUP_KEY_PASSPHRASE must contain at least 16 characters");

  const repositoryRoot = `${resolve(process.cwd())}${sep}`;
  const resolvedPrivatePath = resolve(privatePath);
  if (!isAbsolute(privatePath) || resolvedPrivatePath.startsWith(repositoryRoot)) {
    throw new Error("The private recovery key must use an absolute path outside the repository");
  }

  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
      cipher: "aes-256-cbc",
      passphrase
    }
  });
  await mkdir(dirname(resolve(publicPath)), { recursive: true });
  await mkdir(dirname(resolvedPrivatePath), { recursive: true });
  await writeFile(publicPath, publicKey, { mode: 0o644, flag: "wx" });
  await writeFile(resolvedPrivatePath, privateKey, { mode: 0o600, flag: "wx" });
  await chmod(resolvedPrivatePath, 0o600);
  return {
    publicPath: resolve(publicPath),
    privatePath: resolvedPrivatePath,
    fingerprint: publicKeyFingerprint(createPublicKey(publicKey))
  };
}

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  if (command === "encrypt") {
    const [inputPath, outputPath, publicKeyPath] = args;
    if (!inputPath || !outputPath) throw new Error("Usage: backup-envelope.mjs encrypt INPUT OUTPUT [PUBLIC_KEY]");
    const result = await encryptBackup(inputPath, outputPath, publicKeyPath);
    console.log(JSON.stringify({
      createdAt: result.header.createdAt,
      keyFingerprint: result.header.keyFingerprint,
      plaintextBytes: result.header.plaintextBytes,
      ciphertextBytes: result.ciphertextBytes
    }));
    return;
  }
  if (command === "decrypt") {
    const [inputPath, outputPath, privateKeyPath] = args;
    if (!inputPath || !outputPath || !privateKeyPath) {
      throw new Error("Usage: backup-envelope.mjs decrypt INPUT OUTPUT PRIVATE_KEY");
    }
    const result = await decryptBackup(inputPath, outputPath, privateKeyPath);
    console.log(JSON.stringify(result));
    return;
  }
  if (command === "inspect") {
    const [inputPath] = args;
    if (!inputPath) throw new Error("Usage: backup-envelope.mjs inspect INPUT");
    const result = await inspectBackup(inputPath);
    console.log(JSON.stringify({
      format: result.header.format,
      version: result.header.version,
      algorithm: result.header.algorithm,
      createdAt: result.header.createdAt,
      keyFingerprint: result.header.keyFingerprint,
      plaintextBytes: result.header.plaintextBytes,
      ciphertextBytes: result.ciphertextBytes,
      envelopeBytes: result.envelopeBytes
    }, null, 2));
    return;
  }
  if (command === "keygen") {
    const [publicPath, privatePath] = args;
    const result = await generateBackupKeyPair(publicPath, privatePath);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error("Usage: backup-envelope.mjs <encrypt|decrypt|inspect|keygen> ...");
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
