import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const requiredValue = (name) => {
  const value = process.env[name]?.trim();
  if (!value || /[\r\n\0]/.test(value)) throw new Error(`${name} is missing or invalid`);
  return value;
};
const values = new Map([
  ["RESEND_API_KEY", requiredValue("RESEND_API_KEY")],
  ["SEND_EMAIL_HOOK_SECRET", requiredValue("SEND_EMAIL_HOOK_SECRET")],
  ["AUTH_EMAIL_FROM", requiredValue("AUTH_EMAIL_FROM")],
  ["AUTH_EMAIL_PUBLIC_APP_URL", requiredValue("AUTH_EMAIL_PUBLIC_APP_URL")]
]);
if (!/^re_[A-Za-z0-9_-]{20,}$/.test(values.get("RESEND_API_KEY"))) {
  throw new Error("RESEND_API_KEY format is invalid");
}
if (!/^v1,whsec_[A-Za-z0-9+/]{40,}={0,2}$/.test(values.get("SEND_EMAIL_HOOK_SECRET"))) {
  throw new Error("SEND_EMAIL_HOOK_SECRET format is invalid");
}
if (values.get("AUTH_EMAIL_FROM") !== "WhyNavo <account@auth.whynavo.com>") {
  throw new Error("AUTH_EMAIL_FROM is not the reviewed production sender");
}
if (values.get("AUTH_EMAIL_PUBLIC_APP_URL") !== "https://whynavo.com/") {
  throw new Error("AUTH_EMAIL_PUBLIC_APP_URL is not the reviewed production origin");
}

const quoteDotenv = (value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const directory = await mkdtemp(join(tmpdir(), "whynavo-email-secrets-"));
const envFile = join(directory, "edge-function.env");
try {
  const content = [...values]
    .map(([name, value]) => `${name}=${quoteDotenv(value)}`)
    .join("\n") + "\n";
  await writeFile(envFile, content, { mode: 0o600, flag: "wx" });
  await new Promise((resolve, reject) => {
    const child = spawn("supabase", [
      "secrets",
      "set",
      "--project-ref",
      requiredValue("SUPABASE_PROJECT_REF"),
      "--env-file",
      envFile
    ], { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Supabase CLI exited with ${signal || code}`));
    });
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Encrypted Auth email delivery secrets are configured in Supabase.");
