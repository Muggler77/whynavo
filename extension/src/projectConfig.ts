const env = import.meta.env;

export const DEFAULT_SUPABASE_URL = env.VITE_SUPABASE_URL || "";
export const DEFAULT_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || "";
export const DEFAULT_AUTH_REDIRECT_URL = env.VITE_AUTH_REDIRECT_URL || "";
export const TURNSTILE_SITE_KEY = env.VITE_TURNSTILE_SITE_KEY || "";
export const CAPTCHA_FRAME_URL = env.VITE_CAPTCHA_FRAME_URL || "https://whynavo.com/captcha.html";
export const CAPTCHA_FRAME_ORIGIN = new URL(CAPTCHA_FRAME_URL).origin;
export const SYNC_SERVICE_CONFIGURED = Boolean(DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY);
export const CAPTCHA_CONFIGURED = Boolean(TURNSTILE_SITE_KEY);
export const LEGAL_DOCUMENT_VERSION = "2026-07-28";
