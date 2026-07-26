import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const candidateFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const forbiddenPaths = candidateFiles.filter((path) => (
  (/(^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example")
  || /(^|\/)(?:dist|web-dist|release)(?:\/|$)/.test(path)
  || /(?:backup|recovery|export).*\.json$/i.test(path)
  || /(^|\/)(?:credentials|service-account)(?:\.[^/]+)?$/i.test(path)
  || /(^|\/)id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i.test(path)
  || /\.(?:har|log|sqlite|sqlite3)$/i.test(path)
  || /\.(?:pem|p12|pfx|key|mobileprovision)$/i.test(path)
));
assert.deepEqual(forbiddenPaths, [], `forbidden tracked files: ${forbiddenPaths.join(", ")}`);

const binaryExtensions = new Set([
  ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".mp3", ".mp4", ".pdf",
  ".png", ".ttf", ".wav", ".webm", ".webp", ".woff", ".woff2", ".zip"
]);
const forbiddenContent = [
  { label: "private key", pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { label: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{16,}\b/ },
  { label: "Resend API key", pattern: /\bre_[A-Za-z0-9_-]{20,}\b/ },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { label: "Stripe secret key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { label: "SendGrid API key", pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { label: "database connection string", pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^/\s:@]+:[^@\s/]+@/i },
  {
    label: "assigned private environment value",
    pattern: /\b(?:CLOUDFLARE_API_TOKEN|DATABASE_URL|POSTGRES_PASSWORD|RESEND_API_KEY|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|SEND_EMAIL_HOOK_SECRET|SMTP_PASSWORD|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|TURNSTILE_SECRET_KEY)\s*=\s*[^\s#<{]+/
  },
  { label: "personal machine path", pattern: /\/(?:Users|Volumes)\/[^\s/]+(?:\/|\b)/ },
  { label: "retired custom domain", pattern: /why[.-]tool[.-]com/i },
  { label: "retired community domain", pattern: /whytab[.-]is-a[.-]dev/i },
  { label: "retired product branding", pattern: /\bwetab\b/i }
];
const allowedExampleEmails = new Set(["name@example.com"]);
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

const findings = [];
for (const path of candidateFiles) {
  if (path === "scripts/repository-safety-test.mjs" || path === "scripts/repository-history-safety-test.mjs") continue;
  if (binaryExtensions.has(extname(path).toLowerCase())) continue;
  const content = await readFile(path, "utf8");
  for (const rule of forbiddenContent) {
    if (rule.pattern.test(content)) findings.push(`${path}: ${rule.label}`);
  }
  const unexpectedEmails = (content.match(emailPattern) || []).filter((email) => !allowedExampleEmails.has(email.toLowerCase()));
  if (unexpectedEmails.length) findings.push(`${path}: unexpected email address`);
  for (const token of content.match(jwtPattern) || []) {
    try {
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      if (claims?.role === "service_role" || claims?.role === "supabase_admin") {
        findings.push(`${path}: privileged Supabase JWT`);
      }
    } catch {
      // Non-JWT strings beginning with the same characters are covered by other rules.
    }
  }
}

assert.deepEqual(findings, [], `repository privacy or secret findings:\n${findings.join("\n")}`);
console.log(`Repository safety check passed for ${candidateFiles.length} publishable files.`);
