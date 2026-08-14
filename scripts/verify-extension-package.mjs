import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const extensionDist = join(repositoryRoot, "extension/dist");
const forbiddenBasenames = new Set(["_headers", "_redirects", "CNAME", ".DS_Store"]);
const webOnlyBasenames = new Set([
  "captcha.css",
  "captcha.html",
  "captcha.js",
  "web-search.html",
  "web-search.js"
]);

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};

const files = await collectFiles(extensionDist);
assert(files.length > 0, "extension package is empty");
const relativeFiles = files.map((path) => relative(extensionDist, path));

const forbiddenFiles = relativeFiles
  .filter((path) => {
    const name = basename(path);
    return forbiddenBasenames.has(name) || webOnlyBasenames.has(name) || name.startsWith("*");
  });
assert.deepEqual(
  forbiddenFiles,
  [],
  `extension package contains browser-reserved or web-hosting-only files: ${forbiddenFiles.join(", ")}`
);

const manifest = JSON.parse(await readFile(join(extensionDist, "manifest.json"), "utf8"));
assert.equal(manifest.manifest_version, 3, "extension package must contain a Manifest V3 manifest");
assert.match(String(manifest.version || ""), /^\d+\.\d+\.\d+$/, "extension package version is invalid");
assert.equal(manifest.chrome_url_overrides?.newtab, "index.html", "extension package must override the new tab page");
assert.equal(manifest.background?.service_worker, "background.js", "recurring task reminders require the packaged background worker");
assert.ok(manifest.permissions?.includes("alarms") && manifest.permissions?.includes("storage"), "recurring task reminders require local alarms and storage");
assert.ok(manifest.permissions?.includes("search"), "new-tab web search must use Chrome's Search API");
assert.ok(manifest.optional_permissions?.includes("notifications"), "notification access must remain optional and user initiated");
assert.ok(relativeFiles.includes("background.js"), "background worker is missing from the extension package");

for (const path of files.filter((candidate) => /\.(?:html|js)$/i.test(candidate))) {
  const source = await readFile(path, "utf8");
  const packagedPath = relative(extensionDist, path);
  assert.doesNotMatch(source, /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i, `${packagedPath} loads a remotely hosted script`);
  assert.doesNotMatch(source, /\bimportScripts\s*\(\s*["']https?:\/\//i, `${packagedPath} imports remotely hosted worker code`);
  assert.doesNotMatch(source, /\bimport\s*\(\s*["']https?:\/\//i, `${packagedPath} imports remotely hosted module code`);
  assert.doesNotMatch(source, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/i, `${packagedPath} contains the remotely hosted Turnstile program URL`);
}

console.log(`Extension package check passed for ${files.length} files.`);
