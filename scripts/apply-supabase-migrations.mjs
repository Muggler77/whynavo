import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseQuery } from "./supabase-management.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const migrationsDirectory = join(repoRoot, "supabase/migrations");
const migrationPattern = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const throughIndex = process.argv.indexOf("--through");
const throughVersion = throughIndex >= 0 ? process.argv[throughIndex + 1] : undefined;

if (throughIndex >= 0 && !/^\d{4}$/.test(throughVersion || "")) {
  throw new Error("--through must be followed by a four-digit migration version");
}
if (process.argv.slice(2).some((argument, index, argumentsList) => (
  argument !== "--through" && argumentsList[index - 1] !== "--through"
))) {
  throw new Error("Unsupported migration deployment argument");
}

const migrationFiles = (await readdir(migrationsDirectory))
  .map((filename) => {
    const match = filename.match(migrationPattern);
    return match ? { filename, version: match[1], name: match[2] } : undefined;
  })
  .filter(Boolean)
  .sort((left, right) => left.version.localeCompare(right.version));
const selectedMigrations = throughVersion
  ? migrationFiles.filter((migration) => migration.version <= throughVersion)
  : migrationFiles;

if (!migrationFiles.length) throw new Error("No local Supabase migrations were found");
if (new Set(migrationFiles.map((migration) => migration.version)).size !== migrationFiles.length) {
  throw new Error("Local Supabase migration versions must be unique");
}
if (throughVersion && !migrationFiles.some((migration) => migration.version === throughVersion)) {
  throw new Error(`Local migration ${throughVersion} does not exist`);
}

const appliedRows = await databaseQuery(
  "select version from supabase_migrations.schema_migrations order by version"
);
if (!Array.isArray(appliedRows)) throw new Error("Supabase returned an invalid migration list");
const appliedVersions = new Set(appliedRows.map((row) => String(row.version)));
const localVersions = new Set(migrationFiles.map((migration) => migration.version));
const unknownRemoteVersions = [...appliedVersions].filter((version) => !localVersions.has(version));
if (unknownRemoteVersions.length) {
  throw new Error(`Production contains migrations that are absent locally: ${unknownRemoteVersions.join(", ")}`);
}

let appliedCount = 0;
for (const migration of selectedMigrations) {
  if (appliedVersions.has(migration.version)) continue;
  const sql = (await readFile(join(migrationsDirectory, migration.filename), "utf8")).trim();
  if (!sql) throw new Error(`${migration.filename} is empty`);

  const transaction = [
    "begin;",
    "select pg_advisory_xact_lock(hashtext('whytab:schema-migrations'));",
    sql.endsWith(";") ? sql : `${sql};`,
    `insert into supabase_migrations.schema_migrations (version, statements, name)
      values (
        ${quoteLiteral(migration.version)},
        array[${quoteLiteral(sql)}]::text[],
        ${quoteLiteral(migration.name)}
      )
      on conflict (version) do nothing;`,
    "commit;"
  ].join("\n");

  await databaseQuery(transaction);
  appliedCount += 1;
}

const verifiedRows = await databaseQuery(
  "select version from supabase_migrations.schema_migrations order by version"
);
const verifiedVersions = new Set(
  Array.isArray(verifiedRows) ? verifiedRows.map((row) => String(row.version)) : []
);
const missingVersions = migrationFiles
  .filter((migration) => !throughVersion || migration.version <= throughVersion)
  .map((migration) => migration.version)
  .filter((version) => !verifiedVersions.has(version));
if (missingVersions.length) {
  throw new Error(`Production is missing migrations after deployment: ${missingVersions.join(", ")}`);
}

console.log(
  `Supabase migrations are current through ${throughVersion || migrationFiles.at(-1)?.version}`
  + ` (${selectedMigrations.length} verified, ${appliedCount} applied).`
);
