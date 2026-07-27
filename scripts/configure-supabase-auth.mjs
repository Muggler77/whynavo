import {
  managementRequest,
  supabaseProjectRef,
  updateReviewedAuthConfig
} from "./supabase-management.mjs";

const projectRef = supabaseProjectRef();
const officialOrigin = "https://whynavo.pages.dev/";
const desired = {
  site_url: officialOrigin,
  uri_allow_list: officialOrigin,
  rate_limit_verify: 360,
  rate_limit_token_refresh: 1800
};

await updateReviewedAuthConfig(desired);
const configured = await managementRequest(`/v1/projects/${projectRef}/config/auth`);

for (const [key, expected] of Object.entries(desired)) {
  if (configured?.[key] !== expected) {
    throw new Error(`Supabase Auth field ${key} did not reach the reviewed value`);
  }
}

console.log("Supabase Auth origin and rate limits are configured; all email branding remains gated until production delivery is enabled.");
