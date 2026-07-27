export function resolveReleaseVersion(environment, packageVersion) {
  const explicitVersion = String(environment.RELEASE_VERSION || "").trim();
  if (explicitVersion) return explicitVersion;

  const tagVersion = environment.GITHUB_REF_TYPE === "tag"
    ? String(environment.GITHUB_REF_NAME || "").trim()
    : "";
  return tagVersion || String(packageVersion || "").trim();
}
