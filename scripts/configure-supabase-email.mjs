import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  managementRequest,
  supabaseProjectRef,
  updateReviewedAuthConfig
} from "./supabase-management.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const projectRef = supabaseProjectRef();
const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET?.trim() || "";
if (!/^v1,whsec_[A-Za-z0-9+/]{40,}={0,2}$/.test(hookSecret)) {
  throw new Error("SEND_EMAIL_HOOK_SECRET must use the reviewed Standard Webhooks format");
}

const officialOrigin = "https://whynavo.com/";
const confirmationSubject = "Verify your WhyNavo email / 验证 WhyNavo 邮箱";
const recoverySubject = "Reset your WhyNavo password / 重置 WhyNavo 密码";
const [confirmationTemplate, recoveryTemplate] = await Promise.all([
  readFile(join(repoRoot, "docs/supabase-confirm-signup-email.html"), "utf8"),
  readFile(join(repoRoot, "docs/supabase-reset-password-email.html"), "utf8")
]);
const desired = {
  site_url: officialOrigin,
  uri_allow_list: officialOrigin,
  rate_limit_verify: 360,
  rate_limit_token_refresh: 1800,
  rate_limit_email_sent: 100,
  smtp_max_frequency: 60,
  mailer_subjects_confirmation: confirmationSubject,
  mailer_subjects_recovery: recoverySubject,
  mailer_templates_confirmation_content: confirmationTemplate,
  mailer_templates_recovery_content: recoveryTemplate,
  hook_send_email_enabled: true,
  hook_send_email_uri: `https://${projectRef}.supabase.co/functions/v1/send-auth-email`,
  hook_send_email_secrets: hookSecret
};

await updateReviewedAuthConfig(desired);
const configured = await managementRequest(`/v1/projects/${projectRef}/config/auth`);
for (const [key, expected] of Object.entries(desired)) {
  if (key === "hook_send_email_secrets") {
    if (typeof configured?.[key] !== "string" || !configured[key]) {
      throw new Error("Supabase Auth did not retain the Send Email Hook signing secret");
    }
    continue;
  }
  if (configured?.[key] !== expected) {
    throw new Error(`Supabase Auth field ${key} did not reach the reviewed value`);
  }
}

console.log("Supabase Auth email templates, limits, origin, and signed Send Email Hook are configured.");
