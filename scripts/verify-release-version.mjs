import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolveReleaseVersion } from "./release-version.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const rootPackage = await readJson("../package.json");
const releaseVersion = resolveReleaseVersion(process.env, rootPackage.version);
assert.match(releaseVersion, /^\d+\.\d+\.\d+$/, "release tag or package version must use semantic version format");

const extensionPackage = await readJson("../extension/package.json");
const manifest = await readJson("../extension/public/manifest.json");
const latestVersion = await readJson("../extension/public/latest-version.json");
const serviceWorker = await readFile(new URL("../extension/public/sw.js", import.meta.url), "utf8");
const indexHtml = await readFile(new URL("../extension/index.html", import.meta.url), "utf8");
const releaseNotes = await readFile(new URL(`../docs/releases/${releaseVersion}.md`, import.meta.url), "utf8");
const rootLicense = await readFile(new URL("../LICENSE", import.meta.url), "utf8");
const packagedLicense = await readFile(new URL("../extension/public/LICENSE.txt", import.meta.url), "utf8");
const thirdPartyNotices = await readFile(new URL("../extension/public/THIRD_PARTY_NOTICES.txt", import.meta.url), "utf8");

assert.equal(manifest.name, "whytab - Local-first New Tab", "extension store name must remain distinguishable");
assert.equal(manifest.short_name, "whytab", "extension short name must preserve the product brand");

for (const [label, version] of [
  ["root package", rootPackage.version],
  ["extension package", extensionPackage.version],
  ["extension manifest", manifest.version],
  ["latest version manifest", latestVersion.latestVersion],
  ["minimum supported version", latestVersion.minimumSupportedVersion]
]) {
  assert.equal(version, releaseVersion, `${label} must match release tag ${releaseVersion}`);
}

const escapedVersion = releaseVersion.replaceAll(".", "\\.");
assert.match(serviceWorker, new RegExp(`whytab-shell-v${escapedVersion}`));
assert.match(indexHtml, new RegExp(`app\\.webmanifest\\?v=${escapedVersion}`));
assert.match(releaseNotes, new RegExp(`(?:^|\\n)# whytab ${escapedVersion}(?:\\n|$)`));
assert.equal(packagedLicense, rootLicense, "packaged license must match the repository license");
assert.match(thirdPartyNotices, /@supabase\/supabase-js/);
assert.match(thirdPartyNotices, /lucide-react/);

console.log(`Release metadata is consistent for whytab ${releaseVersion}.`);
