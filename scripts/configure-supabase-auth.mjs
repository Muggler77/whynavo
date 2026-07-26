import {
  managementRequest,
  supabaseProjectRef,
  updateReviewedAuthConfig
} from "./supabase-management.mjs";

const projectRef = supabaseProjectRef();
const officialOrigin = "https://whytab.pages.dev/";
const desired = {
  site_url: officialOrigin,
  uri_allow_list: officialOrigin,
  rate_limit_verify: 360,
  rate_limit_token_refresh: 1800,
  mailer_subjects_confirmation: "Verify your whytab email / 验证 whytab 邮箱",
  mailer_subjects_recovery: "Reset your whytab password / 重置 whytab 密码"
};

await updateReviewedAuthConfig(desired);
const configured = await managementRequest(`/v1/projects/${projectRef}/config/auth`);

for (const [key, expected] of Object.entries(desired)) {
  if (configured?.[key] !== expected) {
    throw new Error(`Supabase Auth field ${key} did not reach the reviewed value`);
  }
}

console.log("Supabase Auth origin, rate limits, and reviewed email subjects are configured; templates remain gated until production email delivery is enabled.");
