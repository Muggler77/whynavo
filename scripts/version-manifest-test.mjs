import assert from "node:assert/strict";

import { resolveReleaseVersion } from "./release-version.mjs";
import { validatePublishedPredecessorManifest } from "./version-manifest.mjs";

assert.equal(
  resolveReleaseVersion({ GITHUB_REF_TYPE: "branch", GITHUB_REF_NAME: "main" }, "0.6.0"),
  "0.6.0",
  "ordinary branch CI must validate the package version instead of treating the branch name as a release tag"
);
assert.equal(
  resolveReleaseVersion({ GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "0.6.0" }, "0.5.7"),
  "0.6.0",
  "tag workflows must validate the actual release tag"
);
assert.equal(
  resolveReleaseVersion({ RELEASE_VERSION: "0.7.0", GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "0.6.0" }, "0.5.7"),
  "0.7.0",
  "an explicit release version must remain authoritative for controlled local verification"
);

const validManifest = {
  latestVersion: "0.5.7",
  minimumSupportedVersion: "0.5.0",
  dataSchemaVersion: 1,
  releaseNotesUrl: "https://github.com/Muggler77/whynavo/releases/latest",
  updateUrl: "https://github.com/Muggler77/whynavo/releases/latest"
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
