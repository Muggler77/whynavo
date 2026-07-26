import { readFile } from "node:fs/promises";

import {
  managementRequest,
  supabaseProjectRef,
  updateReviewedAuthConfig
} from "./supabase-management.mjs";

const projectRef = supabaseProjectRef();
const officialOrigin = "https://whytab.pages.dev/";
const confirmationTemplate = await readFile(
  new URL("../docs/supabase-confirm-signup-email.html", import.meta.url),
  "utf8"
);
const recoveryTemplate = await readFile(
  new URL("../docs/supabase-reset-password-email.html", import.meta.url),
  "utf8"
);
const desired = {
  site_url: officialOrigin,
  uri_allow_list: officialOrigin,
  rate_limit_verify: 360,
  rate_limit_token_refresh: 1800,
  mailer_subjects_confirmation: "Verify your whytab email / 验证 whytab 邮箱",
  mailer_subjects_recovery: "Reset your whytab password / 重置 whytab 密码",
  mailer_templates_confirmation_content: confirmationTemplate,
  mailer_templates_recovery_content: recoveryTemplate
};

await updateReviewedAuthConfig(desired);
const configured = await managementRequest(`/v1/projects/${projectRef}/config/auth`);

for (const [key, expected] of Object.entries(desired)) {
  if (configured?.[key] !== expected) {
    throw new Error(`Supabase Auth field ${key} did not reach the reviewed value`);
  }
}

console.log("Supabase Auth origin, rate limits, and prefetch-safe templates are configured.");
