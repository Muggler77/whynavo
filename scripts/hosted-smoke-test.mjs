import { readFile } from "node:fs/promises";

const origin = (process.env.WHYTAB_ORIGIN || "https://whytab.pages.dev").replace(/\/$/, "");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const fetchWithRetry = async (path, attempts = 6) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${origin}${path}`, {
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(12_000)
      });
      if (response.ok) return response;
      lastError = new Error(`${path} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(2_000 * (attempt + 1));
  }
  throw lastError;
};

const home = await fetchWithRetry("/");
const homeHtml = await home.text();
if (!/<title>whytab<\/title>/.test(homeHtml)) throw new Error("Hosted home page is not the whytab app");
if (!home.headers.get("content-security-policy")?.includes("default-src 'self'")) {
  throw new Error("Hosted home page is missing the expected Content-Security-Policy");
}
if (!home.headers.get("strict-transport-security")) throw new Error("Hosted home page is missing HSTS");
if (home.headers.get("x-content-type-options") !== "nosniff") throw new Error("Hosted home page is missing MIME sniffing protection");
if (home.headers.get("referrer-policy") !== "no-referrer") throw new Error("Hosted home page must not leak referrer data");
if (!home.headers.get("permissions-policy")?.includes("camera=()")) throw new Error("Hosted home page is missing the expected Permissions-Policy");
if (home.headers.get("x-frame-options") !== "DENY") throw new Error("Hosted app must reject framing");
if (home.headers.get("cross-origin-opener-policy") !== "same-origin") {
  throw new Error("Hosted app is missing cross-origin opener isolation");
}
if (home.headers.get("cross-origin-resource-policy") !== "same-origin") {
  throw new Error("Hosted app is missing the expected resource isolation policy");
}

for (const path of ["/privacy.html", "/terms.html"]) {
  const response = await fetchWithRetry(path);
  if (!response.headers.get("content-security-policy")) throw new Error(`${path} is missing security headers`);
}

const captcha = await fetchWithRetry("/captcha.html");
const captchaHtml = await captcha.text();
const captchaCsp = captcha.headers.get("content-security-policy") || "";
if (!captchaHtml.includes("challenges.cloudflare.com/turnstile")) throw new Error("Hosted CAPTCHA page is incomplete");
if (!captchaCsp.includes("https://challenges.cloudflare.com")) throw new Error("CAPTCHA CSP does not allow Turnstile");
if (!captchaCsp.includes("frame-ancestors 'self' chrome-extension:")) throw new Error("CAPTCHA page cannot be embedded by the official extension");
if (captcha.headers.get("x-frame-options")) throw new Error("CAPTCHA route must not send X-Frame-Options");
if (captcha.headers.get("cross-origin-resource-policy") !== "cross-origin") {
  throw new Error("CAPTCHA route must remain embeddable by the extension");
}

const version = await (await fetchWithRetry("/latest-version.json")).json();
if (version.latestVersion !== packageJson.version || version.minimumSupportedVersion !== packageJson.version) {
  throw new Error(`Hosted version manifest does not match ${packageJson.version}`);
}

const manifest = await (await fetchWithRetry("/manifest.json")).json();
if (manifest.version !== packageJson.version) throw new Error("Hosted extension metadata does not match the release version");

const webManifestResponse = await fetchWithRetry("/app.webmanifest");
if (!webManifestResponse.headers.get("content-type")?.includes("manifest")) {
  throw new Error("Hosted PWA manifest has an invalid content type");
}
const webManifest = await webManifestResponse.json();
if (
  webManifest.name !== "whytab"
  || webManifest.display !== "standalone"
  || webManifest.start_url !== "./"
  || !Array.isArray(webManifest.icons)
  || !webManifest.icons.some((icon) => icon?.sizes === "512x512")
) throw new Error("Hosted PWA manifest is incomplete");

const serviceWorker = await (await fetchWithRetry("/sw.js")).text();
if (!serviceWorker.includes(`whytab-shell-v${packageJson.version}`)) {
  throw new Error("Hosted Service Worker cache is not versioned with the release");
}
if (!serviceWorker.includes("captcha.html")) throw new Error("Hosted Service Worker does not isolate CAPTCHA navigation");

const assetPaths = [...homeHtml.matchAll(/(?:src|href)=["']([^"']+\.(?:css|js))["']/g)]
  .map((match) => new URL(match[1], `${origin}/`).pathname);
if (!assetPaths.length) throw new Error("Hosted app does not reference any built assets");
for (const path of new Set(assetPaths)) {
  const asset = await fetchWithRetry(path);
  const contentType = asset.headers.get("content-type") || "";
  if (path.endsWith(".js") && !contentType.includes("javascript")) throw new Error(`${path} has an invalid JavaScript content type`);
  if (path.endsWith(".css") && !contentType.includes("text/css")) throw new Error(`${path} has an invalid stylesheet content type`);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const requireProductionConfig = process.env.REQUIRE_PRODUCTION_CONFIG === "1";
if (requireProductionConfig && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error("Production smoke test requires Supabase URL and publishable key");
}
if (supabaseUrl && supabaseAnonKey) {
  const normalizedSupabaseUrl = supabaseUrl.replace(/\/$/, "");
  const anonHeaders = {
    apikey: supabaseAnonKey,
    authorization: `Bearer ${supabaseAnonKey}`,
    "content-type": "application/json"
  };
  const requireDenied = async (label, path, init = {}) => {
    const response = await fetch(`${normalizedSupabaseUrl}${path}`, {
      ...init,
      headers: { ...anonHeaders, ...init.headers },
      signal: AbortSignal.timeout(12_000)
    });
    if (response.ok) {
      throw new Error(`${label} unexpectedly allowed anonymous access`);
    }
  };
  const authHealth = await fetch(`${normalizedSupabaseUrl}/auth/v1/health`, {
    headers: { apikey: supabaseAnonKey },
    signal: AbortSignal.timeout(12_000)
  });
  if (!authHealth.ok) throw new Error(`Supabase Auth health check returned ${authHealth.status}`);

  const authSettingsResponse = await fetch(`${normalizedSupabaseUrl}/auth/v1/settings`, {
    headers: { apikey: supabaseAnonKey },
    signal: AbortSignal.timeout(12_000)
  });
  if (!authSettingsResponse.ok) throw new Error(`Supabase Auth settings check returned ${authSettingsResponse.status}`);
  const authSettings = await authSettingsResponse.json();
  if (authSettings.disable_signup !== false || authSettings.external?.email !== true) {
    throw new Error("Supabase email registration is disabled");
  }
  if ((authSettings.mailer_autoconfirm ?? authSettings.autoconfirm) !== false) {
    throw new Error("Supabase email confirmation is not enforced");
  }

  await requireDenied(
    "sync_snapshots table",
    "/rest/v1/sync_snapshots?select=user_id&limit=1"
  );
  await requireDenied(
    "exchange_rate_cache table",
    "/rest/v1/exchange_rate_cache?select=currency&limit=1"
  );
  await requireDenied(
    "retired sync RPC",
    "/rest/v1/rpc/push_sync_snapshot",
    {
      method: "POST",
      body: JSON.stringify({
        p_name: "primary",
        p_payload: {},
        p_expected_revision: 0
      })
    }
  );
  await requireDenied(
    "account-bound sync RPC",
    "/rest/v1/rpc/push_sync_snapshot_for_user",
    {
      method: "POST",
      body: JSON.stringify({
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_name: "primary",
        p_payload: {},
        p_expected_revision: 0
      })
    }
  );

  const ratesResponse = await fetch(`${normalizedSupabaseUrl}/functions/v1/boc-rates`, {
    headers: {
      apikey: supabaseAnonKey,
      origin
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (!ratesResponse.ok) throw new Error(`Rate function health check returned ${ratesResponse.status}`);
  const ratesPayload = await ratesResponse.json();
  if (
    !Array.isArray(ratesPayload?.rows)
    || ratesPayload.rows.length !== 2
    || !ratesPayload.rows.every((row) => (
      row
      && (row.currency === "USD" || row.currency === "JPY")
      && typeof row.buyingRate === "string"
      && typeof row.sellingRate === "string"
    ))
  ) throw new Error("Rate function returned an invalid production payload");
}

console.log(`Hosted smoke test passed for whytab ${packageJson.version}.`);
