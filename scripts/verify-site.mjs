import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repoRoot, "site", "dist");
const requiredPages = [
  "en/index.html",
  "en/features/index.html",
  "en/privacy/index.html",
  "en/download/index.html",
  "en/updates/index.html",
  "en/help/index.html",
  "zh-cn/index.html",
  "zh-cn/features/index.html",
  "zh-cn/privacy/index.html",
  "zh-cn/download/index.html",
  "zh-cn/updates/index.html",
  "zh-cn/help/index.html",
  "robots.txt",
  "sitemap.xml",
  "_headers"
];

const forbidden = [
  /service_role/i,
  /SUPABASE_SERVICE/i,
  /BEGIN (RSA|OPENSSH|PRIVATE) KEY/i,
  /gh[pousr]_[A-Za-z0-9_]+/,
  /wang1797274416|1797274416@qq\.com|icloud\.com/i,
  /\/Volumes\/NQ790|\/Users\/muggler/i,
  /account@auth\.whynavo\.com/i
];

const fail = (message) => {
  throw new Error(`[site] ${message}`);
};

for (const relativePath of requiredPages) {
  await access(path.join(outputRoot, relativePath)).catch(() => fail(`missing ${relativePath}`));
}

const htmlFiles = [];
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(fullPath);
    else if (entry.name.endsWith(".html")) htmlFiles.push(fullPath);
  }
};
await walk(outputRoot);

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  if (!/<html\s+lang="[^"]+"/i.test(html)) fail(`${path.relative(outputRoot, file)} has no language declaration`);
  if (!/<link rel="canonical" href="https:\/\/www\.whynavo\.com\//i.test(html)) fail(`${path.relative(outputRoot, file)} has no canonical URL`);
  if (/<script[^>]+src=["']https?:/i.test(html)) fail(`${path.relative(outputRoot, file)} loads remote executable code`);
  if (/<style\b|\sstyle="/i.test(html)) fail(`${path.relative(outputRoot, file)} contains inline styling that conflicts with the site CSP`);
  if (/<img(?![^>]+\salt=)[^>]*>/i.test(html)) fail(`${path.relative(outputRoot, file)} contains an image without alt text`);
  for (const pattern of forbidden) {
    if (pattern.test(html)) fail(`${path.relative(outputRoot, file)} contains a forbidden secret or personal-data pattern`);
  }

  const localReferences = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((match) => match[1]);
  for (const reference of localReferences) {
    const cleanReference = reference.split(/[?#]/, 1)[0];
    const relativeReference = cleanReference.endsWith("/") ? `${cleanReference}index.html` : cleanReference;
    await access(path.join(outputRoot, relativeReference)).catch(() => fail(`${path.relative(outputRoot, file)} references missing ${reference}`));
  }
}

const englishHome = await readFile(path.join(outputRoot, "en/index.html"), "utf8");
const chineseHome = await readFile(path.join(outputRoot, "zh-cn/index.html"), "utf8");
if (!englishHome.includes("LOCAL-FIRST · NO ACCOUNT REQUIRED") || !englishHome.includes("Start without an account")) {
  fail("English first viewport does not state the no-account local-first promise");
}
if (!chineseHome.includes("本地优先 · 无需登录") || !chineseHome.includes("无需登录，直接使用")) {
  fail("Chinese first viewport does not state the no-login local-first promise");
}
if (!englishHome.includes("dynamic wallpaper videos") || !chineseHome.includes("动态壁纸视频")) {
  fail("homepage privacy copy does not disclose device-local dynamic wallpaper media");
}

const styles = await readFile(path.join(outputRoot, "styles.css"), "utf8");
if (!/\.site-header\s*\{[\s\S]*?width:\s*100%;[\s\S]*?padding-right:\s*max\(/.test(styles)) {
  fail("site header background is not full-width with constrained inner gutters");
}

const siteScript = await readFile(path.join(outputRoot, "site.js"), "utf8");
if (/IntersectionObserver|querySelectorAll\(["']\.reveal|\.animate\(/.test(siteScript)) {
  fail("site scroll reveal animation may reintroduce text flicker while scrolling");
}
if (!/\.reveal\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*none;/.test(styles)) {
  fail("site reveal fallback must keep content visible without runtime animation");
}

const headers = await readFile(path.join(outputRoot, "_headers"), "utf8");
for (const requiredHeader of ["Content-Security-Policy", "Strict-Transport-Security", "Referrer-Policy", "Permissions-Policy", "X-Content-Type-Options"]) {
  if (!headers.includes(requiredHeader)) fail(`_headers is missing ${requiredHeader}`);
}

console.log(`Verified ${htmlFiles.length} HTML pages, SEO metadata, security headers and repository privacy boundaries.`);
