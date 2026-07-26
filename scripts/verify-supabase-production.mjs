import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  databaseQuery,
  managementRequest,
  supabaseProjectRef
} from "./supabase-management.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const projectRef = supabaseProjectRef();
const officialOrigin = "https://whytab.pages.dev/";
const migrationPattern = /^(\d{4})_[a-z0-9_]+\.sql$/;
const phaseIndex = process.argv.indexOf("--phase");
const phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : "final";
if (
  !["predeploy", "final"].includes(phase)
  || process.argv.slice(2).some((argument, index, argumentsList) => (
    argument !== "--phase" && argumentsList[index - 1] !== "--phase"
  ))
) {
  throw new Error("Usage: verify-supabase-production.mjs [--phase predeploy|final]");
}
const isFinal = phase === "final";
const requiredPasswordCharacters = "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789";
const retiredDomainPattern = /why[.-]tool[.-]com|whytab[.-]is-a[.-]dev/i;
const confirmationSubject = "Verify your whytab email / 验证 whytab 邮箱";
const recoverySubject = "Reset your whytab password / 重置 whytab 密码";
const [confirmationTemplate, recoveryTemplate] = await Promise.all([
  readFile(join(repoRoot, "docs/supabase-confirm-signup-email.html"), "utf8"),
  readFile(join(repoRoot, "docs/supabase-reset-password-email.html"), "utf8")
]);
const failures = [];
const requireCondition = (condition, message) => {
  if (!condition) failures.push(message);
};

const [
  auth,
  functions,
  secrets,
  advisors,
  networkRestrictions,
  sslEnforcement,
  migrationRows,
  databaseSecurityRows
] = await Promise.all([
  managementRequest(`/v1/projects/${projectRef}/config/auth`),
  managementRequest(`/v1/projects/${projectRef}/functions`),
  managementRequest(`/v1/projects/${projectRef}/secrets`),
  managementRequest(`/v1/projects/${projectRef}/advisors/security`),
  managementRequest(`/v1/projects/${projectRef}/network-restrictions`),
  managementRequest(`/v1/projects/${projectRef}/ssl-enforcement`),
  databaseQuery("select version from supabase_migrations.schema_migrations order by version"),
  databaseQuery(`
    select
      to_regprocedure('public.push_sync_snapshot_for_user(uuid,text,jsonb,bigint)') is not null as current_rpc_exists,
      to_regprocedure('public.pull_sync_snapshot_for_user(uuid,text)') is not null as current_pull_rpc_exists,
      to_regprocedure('public.push_sync_snapshot(text,jsonb,bigint)') is not null as retired_rpc_exists,
      to_regclass('public.sync_session_activity') is not null as session_activity_exists,
      has_function_privilege('authenticated', 'public.push_sync_snapshot_for_user(uuid,text,jsonb,bigint)', 'execute') as authenticated_can_sync,
      has_function_privilege('authenticated', 'public.pull_sync_snapshot_for_user(uuid,text)', 'execute') as authenticated_can_pull,
      has_function_privilege('anon', 'public.push_sync_snapshot_for_user(uuid,text,jsonb,bigint)', 'execute') as anonymous_can_sync,
      has_function_privilege('anon', 'public.pull_sync_snapshot_for_user(uuid,text)', 'execute') as anonymous_can_pull,
      has_function_privilege('authenticated', 'public.push_sync_snapshot(text,jsonb,bigint)', 'execute') as authenticated_can_use_retired_rpc,
      has_table_privilege('anon', 'public.sync_snapshots', 'select') as anonymous_can_read_snapshots,
      has_table_privilege('authenticated', 'public.sync_snapshots', 'select') as authenticated_can_read_snapshots_directly,
      has_table_privilege('authenticated', 'public.sync_snapshots', 'insert,update,delete') as authenticated_can_write_snapshots_directly,
      (
        select policy.qual
        from pg_catalog.pg_policies as policy
        where policy.schemaname = 'public'
          and policy.tablename = 'sync_snapshots'
          and policy.policyname = 'Users own sync snapshots'
        limit 1
      ) as snapshot_select_policy,
      has_table_privilege('anon', 'public.exchange_rate_cache', 'select') as anonymous_can_read_rate_cache,
      has_table_privilege('authenticated', 'public.exchange_rate_cache', 'select') as authenticated_can_read_rate_cache
  `)
]);

requireCondition(auth && typeof auth === "object", "Auth configuration is unavailable");
requireCondition(auth?.site_url === officialOrigin, "Auth Site URL must use the official Pages origin");
const redirectOrigins = String(auth?.uri_allow_list || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
requireCondition(
  redirectOrigins.length === 1 && redirectOrigins[0] === officialOrigin,
  "Auth redirect allow-list must contain only the official Pages origin"
);
requireCondition(auth?.disable_signup === false, "Public email registration is disabled");
requireCondition(auth?.external_email_enabled === true, "Email authentication is disabled");
requireCondition(auth?.mailer_autoconfirm === false, "Email confirmation must remain mandatory");
requireCondition(
  auth?.mailer_allow_unverified_email_sign_ins === false,
  "Unverified email sign-ins must remain disabled"
);
requireCondition(Number(auth?.password_min_length) >= 12, "Auth passwords must require at least 12 characters");
requireCondition(
  auth?.password_required_characters === requiredPasswordCharacters,
  "Auth passwords must require lowercase, uppercase, and numeric characters"
);
const serverLeakedPasswordProtectionEnabled = auth?.password_hibp_enabled === true;
requireCondition(auth?.security_captcha_enabled === true, "Auth CAPTCHA protection is disabled");
requireCondition(auth?.security_captcha_provider === "turnstile", "Auth CAPTCHA must use Cloudflare Turnstile");
requireCondition(
  typeof auth?.security_captcha_secret === "string" && auth.security_captcha_secret.length > 0,
  "Auth CAPTCHA secret is missing"
);
requireCondition(
  auth?.security_update_password_require_current_password === true,
  "Signed-in password changes must require the current password"
);
requireCondition(
  auth?.security_update_password_require_reauthentication === true,
  "Sensitive password changes must require recent reauthentication"
);
requireCondition(
  Number(auth?.security_refresh_token_reuse_interval) <= 10,
  "Refresh-token reuse interval is too permissive"
);
requireCondition(auth?.refresh_token_rotation_enabled === true, "Refresh-token rotation is disabled");
requireCondition(
  Number(auth?.jwt_exp) >= 300 && Number(auth?.jwt_exp) <= 3600,
  "Access-token lifetime must be between five minutes and one hour"
);
requireCondition(auth?.sessions_single_per_user === false, "Multiple devices cannot remain signed in");
requireCondition(auth?.security_manual_linking_enabled === false, "Manual identity linking must remain disabled");
requireCondition(auth?.external_anonymous_users_enabled === false, "Anonymous Auth accounts must remain disabled");
requireCondition(auth?.external_phone_enabled === false, "Unsupported phone authentication must remain disabled");
requireCondition(auth?.mailer_secure_email_change_enabled === true, "Secure email changes must remain enabled");
requireCondition(Number(auth?.mailer_otp_exp) <= 3600, "Email verification codes must expire within one hour");
requireCondition(Number(auth?.mailer_otp_length) >= 8, "Email verification codes must contain at least eight digits");
requireCondition(
  Number(auth?.smtp_max_frequency) >= 60,
  "Repeated email requests must be delayed by at least 60 seconds"
);
requireCondition(
  Number(auth?.rate_limit_email_sent) >= 30 && Number(auth?.rate_limit_email_sent) <= 1000,
  "Auth email throughput must be bounded between 30 and 1000 messages per hour"
);
requireCondition(
  Number(auth?.rate_limit_verify) >= 60 && Number(auth?.rate_limit_verify) <= 360,
  "Email verification rate limits are outside the reviewed range"
);
requireCondition(
  Number(auth?.rate_limit_token_refresh) >= 180 && Number(auth?.rate_limit_token_refresh) <= 1800,
  "Token refresh rate limits are outside the reviewed range"
);
requireCondition(
  Number(auth?.rate_limit_otp) > 0 && Number(auth?.rate_limit_otp) <= 30,
  "OTP request rate limits are outside the reviewed range"
);
requireCondition(
  auth?.mailer_subjects_confirmation === confirmationSubject,
  "Signup email subject does not match the reviewed repository value"
);
requireCondition(
  auth?.mailer_subjects_recovery === recoverySubject,
  "Password-recovery email subject does not match the reviewed repository value"
);
requireCondition(
  auth?.mailer_templates_confirmation_content === confirmationTemplate,
  "Signup email template does not exactly match the reviewed repository file"
);
requireCondition(
  auth?.mailer_templates_recovery_content === recoveryTemplate,
  "Password-recovery email template does not exactly match the reviewed repository file"
);
requireCondition(
  auth?.mailer_notifications_password_changed_enabled === true,
  "Password-change security notifications are disabled"
);
requireCondition(
  auth?.mailer_notifications_email_changed_enabled === true,
  "Email-change security notifications are disabled"
);
requireCondition(auth?.hook_send_email_enabled === true, "The production Auth email Hook is disabled");
requireCondition(
  auth?.hook_send_email_uri === `https://${projectRef}.supabase.co/functions/v1/send-auth-email`,
  "The Auth email Hook does not target the production send-auth-email function"
);
requireCondition(
  typeof auth?.hook_send_email_secrets === "string" && auth.hook_send_email_secrets.length > 0,
  "The Auth email Hook signing secret is missing"
);
requireCondition(
  !retiredDomainPattern.test([
    auth?.smtp_admin_email,
    auth?.smtp_host,
    auth?.site_url,
    auth?.uri_allow_list,
    auth?.mailer_templates_confirmation_content,
    auth?.mailer_templates_recovery_content
  ].filter(Boolean).join(" ")),
  "Auth configuration still references a retired domain"
);

const requiredSecretNames = new Set([
  "RESEND_API_KEY",
  "SEND_EMAIL_HOOK_SECRET",
  "AUTH_EMAIL_FROM",
  "AUTH_EMAIL_PUBLIC_APP_URL"
]);
const configuredSecretNames = new Set(
  Array.isArray(secrets) ? secrets.map((secret) => String(secret.name || "")) : []
);
for (const name of requiredSecretNames) {
  requireCondition(configuredSecretNames.has(name), `Edge Function secret ${name} is missing`);
}

const minimumFunctionVersions = new Map([
  ["boc-rates", { version: 7, verifyJwt: false }],
  ["send-auth-email", { version: 3, verifyJwt: false }],
  ["delete-account", { version: 4, verifyJwt: true }]
]);
const functionsBySlug = new Map(
  Array.isArray(functions) ? functions.map((entry) => [entry.slug, entry]) : []
);
for (const [slug, expected] of minimumFunctionVersions) {
  const deployed = functionsBySlug.get(slug);
  requireCondition(deployed?.status === "ACTIVE", `${slug} is not active`);
  requireCondition(Number(deployed?.version) >= expected.version, `${slug} is older than the 0.6.0 production function`);
  requireCondition(deployed?.verify_jwt === expected.verifyJwt, `${slug} has an unsafe JWT verification setting`);
}

const localMigrationVersions = (await readdir(join(repoRoot, "supabase/migrations")))
  .map((filename) => filename.match(migrationPattern)?.[1])
  .filter(Boolean)
  .sort();
const remoteMigrationVersions = Array.isArray(migrationRows)
  ? migrationRows.map((row) => String(row.version)).sort()
  : [];
if (isFinal) {
  requireCondition(
    JSON.stringify(remoteMigrationVersions) === JSON.stringify(localMigrationVersions),
    "Production database migrations do not exactly match the repository"
  );
} else {
  const requiredPredeployVersions = localMigrationVersions.filter((version) => version <= "0013");
  const unknownRemoteVersions = remoteMigrationVersions.filter((version) => !localMigrationVersions.includes(version));
  requireCondition(unknownRemoteVersions.length === 0, "Production contains an unreviewed migration");
  requireCondition(
    requiredPredeployVersions.every((version) => remoteMigrationVersions.includes(version)),
    "Production is missing a backward-compatible predeployment migration"
  );
}

const databaseSecurity = Array.isArray(databaseSecurityRows) ? databaseSecurityRows[0] : undefined;
requireCondition(databaseSecurity?.current_rpc_exists === true, "The account-bound sync RPC is missing");
requireCondition(databaseSecurity?.current_pull_rpc_exists === true, "The account-bound snapshot read RPC is missing");
requireCondition(databaseSecurity?.retired_rpc_exists === true, "The retired sync RPC definition is unexpectedly missing");
requireCondition(databaseSecurity?.session_activity_exists === true, "The server-enforced sync session policy is missing");
requireCondition(databaseSecurity?.authenticated_can_sync === true, "Signed-in users cannot call the account-bound sync RPC");
requireCondition(databaseSecurity?.authenticated_can_pull === true, "Signed-in users cannot call the account-bound read RPC");
requireCondition(databaseSecurity?.anonymous_can_sync === false, "Anonymous users can call the sync RPC");
requireCondition(databaseSecurity?.anonymous_can_pull === false, "Anonymous users can call the snapshot read RPC");
requireCondition(databaseSecurity?.anonymous_can_read_snapshots === false, "Anonymous users can read sync snapshots");
if (isFinal) {
  requireCondition(
    databaseSecurity?.authenticated_can_use_retired_rpc === false,
    "Signed-in users can still call the retired unbound sync RPC"
  );
} else {
  requireCondition(
    databaseSecurity?.authenticated_can_use_retired_rpc === true,
    "Published 0.5.x clients cannot write through the compatibility sync RPC during rollout"
  );
}
requireCondition(
  databaseSecurity?.authenticated_can_read_snapshots_directly === true,
  "Published 0.5.x clients cannot read their own snapshots during the 0.6.0 transition"
);
requireCondition(
  /auth\.uid\(\).*user_id/i.test(String(databaseSecurity?.snapshot_select_policy || ""))
    && /has_whytab_sync_session/i.test(String(databaseSecurity?.snapshot_select_policy || "")),
  "The compatibility snapshot-read policy does not enforce account ownership and session expiry"
);
requireCondition(
  databaseSecurity?.authenticated_can_write_snapshots_directly === false,
  "Signed-in users can bypass revision-checked snapshot writes"
);
requireCondition(databaseSecurity?.anonymous_can_read_rate_cache === false, "Anonymous users can read the internal rate cache");
requireCondition(
  databaseSecurity?.authenticated_can_read_rate_cache === false,
  "Signed-in users can read the internal rate cache"
);

requireCondition(
  sslEnforcement?.currentConfig?.database === true && sslEnforcement?.appliedSuccessfully === true,
  "Database SSL enforcement is disabled or pending"
);
requireCondition(
  networkRestrictions?.status === "applied"
    && Array.isArray(networkRestrictions?.config?.dbAllowedCidrs)
    && networkRestrictions.config.dbAllowedCidrs.length === 1
    && networkRestrictions.config.dbAllowedCidrs[0] === "0.0.0.0/32"
    && Array.isArray(networkRestrictions?.config?.dbAllowedCidrsV6)
    && networkRestrictions.config.dbAllowedCidrsV6.length === 0,
  "Direct production database ingress is not fully closed"
);

const allowedAdvisorFindings = new Set([
  "rls_enabled_no_policy:public.exchange_rate_cache",
  "authenticated_security_definer_function_executable:public.has_whytab_sync_session",
  "authenticated_security_definer_function_executable:public.pull_sync_snapshot_for_user",
  "authenticated_security_definer_function_executable:public.push_sync_snapshot_for_user"
]);
const advisorFindings = Array.isArray(advisors?.lints) ? advisors.lints : [];
for (const finding of advisorFindings) {
  if (finding?.name === "auth_leaked_password_protection") {
    if (serverLeakedPasswordProtectionEnabled) {
      failures.push("Supabase Security Advisor disagrees with the enabled leaked-password setting");
    }
    continue;
  }
  if (!["WARN", "ERROR"].includes(String(finding?.level || "").toUpperCase())) continue;
  const objectName = [finding?.metadata?.schema, finding?.metadata?.name].filter(Boolean).join(".");
  const key = `${finding?.name}:${objectName}`;
  requireCondition(
    allowedAdvisorFindings.has(key),
    `Unreviewed Supabase Security Advisor finding: ${finding?.name || "unknown"} (${objectName || "unknown object"})`
  );
}

if (failures.length) {
  throw new Error(`Supabase production gate failed:\n- ${failures.join("\n- ")}`);
}

if (!serverLeakedPasswordProtectionEnabled) {
  console.warn(
    "Supabase server-side leaked-password protection is unavailable on the selected Free plan; "
      + "the reviewed whytab client-side k-anonymous check remains mandatory and is not equivalent to a backend control."
  );
}
console.log(`Supabase production ${phase} Auth, database, function, and network gates passed.`);
