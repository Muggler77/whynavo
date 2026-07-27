import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validatePublishedPredecessorManifest } from "./version-manifest.mjs";

const sourceUrl = "https://whynavo.pages.dev/latest-version.json";
const outputPath = resolve(process.argv[2] || "extension/web-dist/latest-version.json");
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);

const response = await fetch(sourceUrl, {
  cache: "no-store",
  redirect: "error",
  signal: AbortSignal.timeout(12_000)
});
if (!response.ok) {
  throw new Error(`Published version manifest returned ${response.status}`);
}
const contentLength = Number(response.headers.get("content-length") || 0);
if (contentLength > 16_384) throw new Error("Published version manifest is too large");
const text = await response.text();
if (text.length > 16_384) throw new Error("Published version manifest is too large");
const manifest = validatePublishedPredecessorManifest(
  JSON.parse(text),
  packageJson.version
);

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o644
});
console.log(`Staged Pages with the currently public update manifest ${manifest.latestVersion}.`);
