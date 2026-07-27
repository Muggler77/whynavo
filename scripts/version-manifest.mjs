const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const OFFICIAL_RELEASE_URL = "https://github.com/Muggler77/whynavo/releases/latest";

export const compareReleaseVersions = (left, right) => {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

export const validatePublishedPredecessorManifest = (manifest, nextVersion) => {
  if (
    !manifest
    || typeof manifest !== "object"
    || Array.isArray(manifest)
    || !RELEASE_VERSION_PATTERN.test(String(nextVersion || ""))
    || !RELEASE_VERSION_PATTERN.test(String(manifest.latestVersion || ""))
    || !RELEASE_VERSION_PATTERN.test(String(manifest.minimumSupportedVersion || ""))
    || compareReleaseVersions(manifest.minimumSupportedVersion, manifest.latestVersion) > 0
    || compareReleaseVersions(manifest.latestVersion, nextVersion) >= 0
    || Number(manifest.dataSchemaVersion) !== 1
    || manifest.releaseNotesUrl !== OFFICIAL_RELEASE_URL
    || manifest.updateUrl !== OFFICIAL_RELEASE_URL
  ) {
    throw new Error("Published version manifest is not a safe predecessor of this release");
  }
  return manifest;
};
