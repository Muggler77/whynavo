import assert from "node:assert/strict";

import { validatePublishedPredecessorManifest } from "./version-manifest.mjs";

const validManifest = {
  latestVersion: "0.5.7",
  minimumSupportedVersion: "0.5.0",
  dataSchemaVersion: 1,
  releaseNotesUrl: "https://github.com/Muggler77/whytab/releases/latest",
  updateUrl: "https://github.com/Muggler77/whytab/releases/latest"
};

assert.equal(
  validatePublishedPredecessorManifest(validManifest, "0.6.0"),
  validManifest
);

for (const invalidManifest of [
  { ...validManifest, latestVersion: "0.6.0" },
  { ...validManifest, latestVersion: "0.7.0" },
  { ...validManifest, minimumSupportedVersion: "0.5.8" },
  { ...validManifest, dataSchemaVersion: 2 },
  { ...validManifest, updateUrl: "https://example.com/download" },
  { ...validManifest, releaseNotesUrl: "https://example.com/releases" },
  [],
  null
]) {
  assert.throws(
    () => validatePublishedPredecessorManifest(invalidManifest, "0.6.0"),
    /not a safe predecessor/
  );
}

assert.throws(
  () => validatePublishedPredecessorManifest(validManifest, "v0.6.0"),
  /not a safe predecessor/
);

console.log("Version manifest predecessor tests passed.");
