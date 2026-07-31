import { createClient } from "jsr:@supabase/supabase-js@2.110.8";

const OFFICIAL_WEB_ORIGIN = "https://whynavo.com";
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const allowedOrigin = (origin: string | null) => (
  Boolean(origin && (origin === OFFICIAL_WEB_ORIGIN || EXTENSION_ORIGIN.test(origin)))
);
const corsHeaders = (origin: string | null) => ({
  "access-control-allow-origin": origin || OFFICIAL_WEB_ORIGIN,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'",
  "x-content-type-options": "nosniff",
  "vary": "Origin"
});

const json = (body: Record<string, unknown>, status: number, origin: string | null) => Response.json(body, {
  status,
  headers: corsHeaders(origin)
});

const readNamedKey = (name: string, legacyName: string) => {
  try {
    const keys = JSON.parse(Deno.env.get(name) || "{}") as Record<string, unknown>;
    const defaultKey = keys.default;
    if (typeof defaultKey === "string" && defaultKey) return defaultKey;
    const currentKey = Object.values(keys).find((value): value is string => (
      typeof value === "string" && Boolean(value)
    ));
    if (currentKey) return currentKey;
  } catch {
    // Fall through to legacy project keys during staged key migration.
  }
  return Deno.env.get(legacyName) || "";
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!allowedOrigin(origin)) return json({ error: "origin not allowed" }, 403, origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, origin);

  const authorization = req.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = readNamedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const serviceRoleKey = readNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization) return json({ error: "authentication required" }, 401, origin);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "service is not configured" }, 500, origin);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 8192) return json({ error: "request is too large" }, 413, origin);
  const rawBody = await req.text();
  if (rawBody.length > 8192) return json({ error: "request is too large" }, 413, origin);
  const requestBody = (() => {
    try {
      return JSON.parse(rawBody) as {
        expectedUserId?: unknown;
        password?: unknown;
        captchaToken?: unknown;
      };
    } catch {
      return null;
    }
  })();
  const expectedUserId = typeof requestBody?.expectedUserId === "string" ? requestBody.expectedUserId : "";
  const password = typeof requestBody?.password === "string" ? requestBody.password : "";
  const captchaToken = typeof requestBody?.captchaToken === "string" ? requestBody.captchaToken : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expectedUserId)
    || !password
    || password.length > 256
    || !captchaToken
    || captchaToken.length > 4096
  ) {
    return json({ error: "account verification required" }, 400, origin);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user?.email) return json({ error: "invalid session" }, 401, origin);
  if (userData.user.id !== expectedUserId) return json({ error: "authenticated account changed" }, 409, origin);

  const verificationClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: verificationData, error: verificationError } = await verificationClient.auth.signInWithPassword({
    email: userData.user.email,
    password,
    options: { captchaToken }
  });
  if (verificationError || verificationData.user?.id !== userData.user.id) {
    return json({ error: "account verification failed" }, 401, origin);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
  if (deleteError) return json({ error: "account deletion failed" }, 500, origin);

  return json({ deleted: true }, 200, origin);
});
