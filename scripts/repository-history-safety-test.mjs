import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const revisions = execFileSync("git", ["rev-list", "--all"], { encoding: "utf8" })
  .trim()
  .split(/\s+/)
  .filter(Boolean);

const excludedPaths = [
  ":(exclude)scripts/repository-safety-test.mjs",
  ":(exclude)scripts/repository-history-safety-test.mjs"
];

const grepHistory = (pattern) => {
  if (!revisions.length) return [];
  try {
    return execFileSync(
      "git",
      ["grep", "-I", "-l", "-E", "-e", pattern, ...revisions, "--", ".", ...excludedPaths],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    ).trim().split("\n").filter(Boolean);
  } catch (error) {
    if (error?.status === 1) return [];
    throw error;
  }
};

const findings = [];
const forbiddenHistory = [
  ["private key", "-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----"],
  ["GitHub token", "(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"],
  ["Supabase secret key", "sb_secret_[A-Za-z0-9_-]{16,}"],
  ["Resend API key", "(^|[^[:alnum:]_])re_[A-Za-z0-9_-]{20,}($|[^[:alnum:]_-])"],
  ["AWS access key", "(AKIA|ASIA)[A-Z0-9]{16}"],
  ["Google API key", "AIza[0-9A-Za-z_-]{30,}"],
  ["Slack token", "xox[baprs]-[A-Za-z0-9-]{20,}"],
  ["Stripe secret key", "sk_(live|test)_[A-Za-z0-9]{16,}"],
  ["SendGrid API key", "SG\\.[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{16,}"],
  ["database connection string", "(postgres(ql)?|mysql|mongodb(\\+srv)?):\\/\\/[^/[:space:]:@]+:[^@[:space:]/]+@"],
  ["assigned private environment value", "(CLOUDFLARE_API_TOKEN|DATABASE_URL|POSTGRES_PASSWORD|RESEND_API_KEY|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|SEND_EMAIL_HOOK_SECRET|SMTP_PASSWORD|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|TURNSTILE_SECRET_KEY)[[:space:]]*=[[:space:]]*[^[:space:]#<{]+"],
  ["personal machine path", "/(Users|Volumes)/[^[:space:]/]+(/|$)"],
  ["retired custom domain", "why[.-]tool[.-]com"],
  ["retired community domain", "whytab[.-]is-a[.-]dev"],
  ["retired product branding", "(^|[^[:alnum:]_])wetab([^[:alnum:]_]|$)"]
];

for (const [label, pattern] of forbiddenHistory) {
  const matches = grepHistory(pattern);
  if (matches.length) findings.push(`${label}: ${matches.slice(0, 8).join(", ")}`);
}

const historicalPaths = execFileSync(
  "git",
  ["log", "--all", "--name-only", "--format="],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
).split(/\r?\n/).filter(Boolean);
const forbiddenPaths = historicalPaths.filter((path) => (
  (/(^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example")
  || /(^|\/)(?:credentials|service-account)(?:\.[^/]+)?$/i.test(path)
  || /(^|\/)id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i.test(path)
  || /\.(?:har|log|sqlite|sqlite3)$/i.test(path)
  || /\.(?:pem|p12|pfx|key|mobileprovision)$/i.test(path)
));
if (forbiddenPaths.length) {
  findings.push(`forbidden historical paths: ${[...new Set(forbiddenPaths)].slice(0, 12).join(", ")}`);
}

const authorEmails = execFileSync("git", ["log", "--all", "--format=%ae"], { encoding: "utf8" })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const unexpectedAuthorEmails = [...new Set(authorEmails)].filter((email) => (
  !email.toLowerCase().endsWith("@users.noreply.github.com")
));
if (unexpectedAuthorEmails.length) findings.push("commit history contains a non-private author email");

assert.deepEqual(findings, [], `repository history privacy or secret findings:\n${findings.join("\n")}`);
console.log(`Repository history safety check passed for ${revisions.length} commits.`);
