import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBackupExport } from "./verify-backup-export.mjs";

const directory = await mkdtemp(join(tmpdir(), "whynavo-backup-export-test-"));

try {
  await Promise.all([
    writeFile(join(directory, "roles.sql"), "CREATE ROLE authenticated;\n"),
    writeFile(
      join(directory, "schema.sql"),
      'CREATE TABLE "public"."sync_snapshots" ();\nCREATE TABLE public.sync_session_activity ();\n'
    ),
    writeFile(
      join(directory, "auth-data.sql"),
      'COPY "auth"."users" ("id") FROM stdin;\n\\.\nCOPY auth.identities (id) FROM stdin;\n\\.\n'
    ),
    writeFile(
      join(directory, "data.sql"),
      'COPY "public"."sync_snapshots" ("user_id") FROM stdin;\n\\.\n'
    )
  ]);
  await verifyBackupExport(directory);

  await writeFile(
    join(directory, "auth-data.sql"),
    "COPY auth.users (id) FROM stdin;\n\\.\nCOPY auth.refresh_tokens (id) FROM stdin;\n\\.\n"
  );
  await assert.rejects(
    verifyBackupExport(directory),
    /unapproved table: auth\.refresh_tokens/
  );

  console.log("Backup export structure and Auth-table rejection tests passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
