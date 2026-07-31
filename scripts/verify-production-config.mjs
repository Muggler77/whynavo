import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const extensionRoot = fileURLToPath(new URL("../extension/", import.meta.url));
const loadEnvironmentFiles = (directory) =>
  [".env", ".env.local", ".env.production", ".env.production.local"].reduce((loaded, filename) => {
    const path = resolve(directory, filename);
    return existsSync(path) ? { ...loaded, ...parseEnv(readFileSync(path, "utf8")) } : loaded;
  }, {});
const environment = {
  ...loadEnvironmentFiles(repositoryRoot),
  ...loadEnvironmentFiles(extensionRoot),
  ...process.env
};

const required = {
  VITE_SUPABASE_URL: environment.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: environment.VITE_SUPABASE_ANON_KEY,
  VITE_AUTH_REDIRECT_URL: environment.VITE_AUTH_REDIRECT_URL,
  VITE_TURNSTILE_SITE_KEY: environment.VITE_TURNSTILE_SITE_KEY,
  VITE_CAPTCHA_FRAME_URL: environment.VITE_CAPTCHA_FRAME_URL
};
const OFFICIAL_SUPABASE_PROJECT_REF = "keafulupzvfljvbzwgrq";

for (const [name, value] of Object.entries(required)) {
  if (!value?.trim()) throw new Error(`${name} is required for an official production build`);
}

const supabaseUrl = new URL(required.VITE_SUPABASE_URL);
if (supabaseUrl.protocol !== "https:" || !supabaseUrl.hostname.endsWith(".supabase.co")) {
  throw new Error("VITE_SUPABASE_URL must use an official HTTPS Supabase project URL");
}
const projectRef = supabaseUrl.hostname.slice(0, -".supabase.co".length);
if (!/^[a-z0-9]{20}$/.test(projectRef)) {
  throw new Error("VITE_SUPABASE_URL must contain a valid Supabase project reference");
}
if (projectRef !== OFFICIAL_SUPABASE_PROJECT_REF) {
  throw new Error("VITE_SUPABASE_URL must use the official whynavo Supabase project");
}

if (!/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(required.VITE_SUPABASE_ANON_KEY)) {
  throw new Error("VITE_SUPABASE_ANON_KEY must be a publishable or legacy anon key");
}
if (required.VITE_SUPABASE_ANON_KEY.startsWith("eyJ")) {
  let claims;
  try {
    claims = JSON.parse(Buffer.from(required.VITE_SUPABASE_ANON_KEY.split(".")[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("VITE_SUPABASE_ANON_KEY contains an invalid JWT payload");
  }
  if (claims?.role !== "anon" || claims?.ref !== projectRef) {
    throw new Error("VITE_SUPABASE_ANON_KEY must be the anon key for VITE_SUPABASE_URL");
  }
}

if (required.VITE_AUTH_REDIRECT_URL !== "https://whynavo.com/") {
  throw new Error("VITE_AUTH_REDIRECT_URL must match the official WhyNavo origin");
}
if (required.VITE_CAPTCHA_FRAME_URL !== "https://whynavo.com/captcha.html") {
  throw new Error("VITE_CAPTCHA_FRAME_URL must use the official isolated CAPTCHA page");
}

if (
  !/^[A-Za-z0-9_-]{10,128}$/.test(required.VITE_TURNSTILE_SITE_KEY)
  || /^[123]x0{20}[A-Z]{2}$/.test(required.VITE_TURNSTILE_SITE_KEY)
) {
  throw new Error("VITE_TURNSTILE_SITE_KEY must be a production Cloudflare Turnstile site key");
}

console.log("Official production configuration is present and structurally valid.");
