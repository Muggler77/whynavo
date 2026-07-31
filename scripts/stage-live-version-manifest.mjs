import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validatePublishedPredecessorManifest } from "./version-manifest.mjs";

const outputPath = resolve(process.argv[2] || "extension/web-dist/latest-version.json");
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);
const previousManifest = JSON.parse(
  await readFile(new URL("../extension/public/previous-version.json", import.meta.url), "utf8")
);
const manifest = validatePublishedPredecessorManifest(
  previousManifest,
  packageJson.version
);

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o644
});
console.log(`Staged Pages with the currently public update manifest ${manifest.latestVersion}.`);
