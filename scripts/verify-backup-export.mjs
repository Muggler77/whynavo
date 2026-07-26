import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const allowedAuthTables = new Set(["identities", "users"]);
const normalizeIdentifier = (value) => value.replaceAll('"', "").toLowerCase();

async function requireNonEmptyFile(path, label) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size < 1) {
    throw new Error(`${label} is missing or empty`);
  }
}

async function scanSql(path, onLine) {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) onLine(line);
  } finally {
    lines.close();
    stream.destroy();
  }
}

export async function verifyBackupExport(directory) {
  const root = resolve(directory);
  const rolesPath = join(root, "roles.sql");
  const schemaPath = join(root, "schema.sql");
  const authPath = join(root, "auth-data.sql");
  const dataPath = join(root, "data.sql");

  await Promise.all([
    requireNonEmptyFile(rolesPath, "roles.sql"),
    requireNonEmptyFile(schemaPath, "schema.sql"),
    requireNonEmptyFile(authPath, "auth-data.sql"),
    requireNonEmptyFile(dataPath, "data.sql")
  ]);

  let hasRoleStatement = false;
  await scanSql(rolesPath, (line) => {
    if (/^\s*(?:create|alter)\s+role\b/i.test(line)) hasRoleStatement = true;
  });
  if (!hasRoleStatement) throw new Error("roles.sql contains no role statements");

  const requiredSchemaObjects = new Set(["sync_snapshots", "sync_session_activity"]);
  await scanSql(schemaPath, (line) => {
    const match = line.match(/^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?public"?\.)?"?[a-z0-9_]+"?)/i);
    if (!match) return;
    const identifier = normalizeIdentifier(match[1]);
    const table = identifier.split(".").at(-1);
    requiredSchemaObjects.delete(table);
  });
  if (requiredSchemaObjects.size) {
    throw new Error(`schema.sql is missing required tables: ${[...requiredSchemaObjects].join(", ")}`);
  }

  const exportedAuthTables = new Set();
  await scanSql(authPath, (line) => {
    const match = line.match(/^\s*copy\s+((?:"?auth"?\.)"?[a-z0-9_]+"?)/i);
    if (!match) return;
    const identifier = normalizeIdentifier(match[1]);
    const [schema, table] = identifier.split(".");
    if (schema !== "auth" || !allowedAuthTables.has(table)) {
      throw new Error(`auth-data.sql contains an unapproved table: ${identifier}`);
    }
    exportedAuthTables.add(table);
  });
  for (const table of allowedAuthTables) {
    if (!exportedAuthTables.has(table)) {
      throw new Error(`auth-data.sql is missing auth.${table}`);
    }
  }

  let hasSyncSnapshots = false;
  await scanSql(dataPath, (line) => {
    const match = line.match(/^\s*copy\s+((?:"?public"?\.)?"?[a-z0-9_]+"?)/i);
    if (!match) return;
    const identifier = normalizeIdentifier(match[1]);
    if (identifier === "public.sync_snapshots") hasSyncSnapshots = true;
  });
  if (!hasSyncSnapshots) throw new Error("data.sql is missing public.sync_snapshots");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) {
    throw new Error("Usage: verify-backup-export.mjs DIRECTORY");
  }
  await verifyBackupExport(directory);
  console.log("Backup export structure and Auth-table allowlist passed.");
}
