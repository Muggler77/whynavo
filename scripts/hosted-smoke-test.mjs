import { readFile } from "node:fs/promises";

const origin = (process.env.WHYNAVO_ORIGIN || "https://whynavo.com").replace(/\/$/, "");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const allowPreviousVersionManifest = process.env.ALLOW_PREVIOUS_VERSION_MANIFEST === "1";
const releasePattern = /^\d+\.\d+\.\d+$/;
const compareVersions = (left, right) => {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const cspSources = (policy, directive) => {
  const entry = policy
    .split(";")
    .map((value) => value.trim().split(/\s+/))
    .find(([name]) => name === directive);
  return new Set(entry?.slice(1) || []);
};
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

const fetchTextUntil = async (path, predicate, errorMessage, attempts = 8) => {
  let lastError = new Error(errorMessage);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const separator = path.includes("?") ? "&" : "?";
      const response = await fetch(
        `${origin}${path}${separator}whynavo_smoke=${Date.now()}-${attempt}`,
        {
          cache: "no-store",
          redirect: "follow",
          signal: AbortSignal.timeout(12_000)
        }
      );
      if (!response.ok) {
        lastError = new Error(`${path} returned ${response.status}`);
      } else {
        const text = await response.text();
        if (predicate(text, response)) return { response, text };
        lastError = new Error(errorMessage);
      }
    } catch (error) {
      lastError = error;
    }
    await wait(Math.min(2_000 * (attempt + 1), 10_000));
  }
  throw lastError;
};

const fetchJsonUntil = async (path, predicate, errorMessage, attempts = 12) => {
  const result = await fetchTextUntil(
    path,
    (text, response) => {
      try {
        return predicate(JSON.parse(text), response);
      } catch {
        return false;
      }
    },
    errorMessage,
    attempts
  );
  return { response: result.response, json: JSON.parse(result.text) };
};

// A Pages custom domain can briefly keep serving the previous deployment after
// Wrangler reports success. Retry the expected content instead of accepting the
// first HTTP 200, while retaining every header and asset check below.
const { response: home, text: homeHtml } = await fetchTextUntil(
  "/",
  (html) => (
    /<title>WhyNavo<\/title>/.test(html)
    && html.includes(`app.webmanifest?v=${packageJson.version}`)
  ),
  `Hosted home page is not the WhyNavo ${packageJson.version} app`,
  12
);
const homeCsp = home.headers.get("content-security-policy") || "";
if (!homeCsp.includes("default-src 'self'")) {
  throw new Error("Hosted home page is missing the expected Content-Security-Policy");
}
if (!cspSources(homeCsp, "connect-src").has("https://api.pwnedpasswords.com")) {
  throw new Error("Hosted app cannot reach the privacy-preserving password safety service");
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

for (const path of ["/privacy.html", "/terms.html", "/support.html"]) {
  const response = await fetchWithRetry(path);
  if (!response.headers.get("content-security-policy")) throw new Error(`${path} is missing security headers`);
}

await fetchTextUntil(
  "/privacy.html",
  (html) => html.includes("Cloudflare R2") && html.includes("35 days") && !html.includes("does not currently retain independent off-site exports"),
  "Hosted privacy notice does not disclose the active encrypted off-site backup and retention policy"
);
await fetchTextUntil(
  "/support.html",
  (html) => html.includes("WhyNavo Support") && html.includes("private vulnerability reporting"),
  "Hosted support page is incomplete"
);

const { response: confirmation, text: confirmationHtml } = await fetchTextUntil(
  "/confirm.html",
  (html, response) => (
    html.includes("./confirm.js")
    && html.includes("./confirm.css")
    && !html.includes("/auth/v1/verify")
    && response.headers.get("cache-control") === "no-store"
  ),
  "Hosted email-confirmation interstitial or its no-store policy is incomplete"
);
if (confirmation.headers.get("cache-control") !== "no-store") {
  throw new Error("Email-confirmation interstitial must not be cached");
}
const confirmationClient = await (await fetchWithRetry("/confirm.js")).text();
if (
  !confirmationClient.includes('candidate.pathname !== "/auth/v1/verify"')
  || !confirmationClient.includes("event.isTrusted")
  || !confirmationClient.includes("window.location.replace(verificationUrl)")
) {
  throw new Error("Hosted email-confirmation interstitial does not enforce an explicit verified click");
}

const { response: captcha, text: captchaHtml } = await fetchTextUntil(
  "/captcha.html",
  (html, response) => {
    const policy = response.headers.get("content-security-policy") || "";
    return (
      html.includes("challenges.cloudflare.com/turnstile")
      && policy.includes("frame-ancestors 'self' chrome-extension:")
      && response.headers.get("cross-origin-resource-policy") === "cross-origin"
      && !response.headers.get("x-frame-options")
    );
  },
  "Hosted CAPTCHA page is not ready for secure extension embedding"
);
const captchaCsp = captcha.headers.get("content-security-policy") || "";
if (!captchaHtml.includes("challenges.cloudflare.com/turnstile")) throw new Error("Hosted CAPTCHA page is incomplete");
for (const directive of ["script-src", "connect-src", "frame-src"]) {
  if (!cspSources(captchaCsp, directive).has("https://challenges.cloudflare.com")) {
    throw new Error(`CAPTCHA CSP ${directive} does not allow the exact Turnstile origin`);
  }
}
const captchaAncestors = cspSources(captchaCsp, "frame-ancestors");
if (!captchaAncestors.has("'self'") || !captchaAncestors.has("chrome-extension:")) {
  throw new Error("CAPTCHA page cannot be embedded by the official extension");
}
if (captcha.headers.get("x-frame-options")) throw new Error("CAPTCHA route must not send X-Frame-Options");
if (captcha.headers.get("cross-origin-resource-policy") !== "cross-origin") {
  throw new Error("CAPTCHA route must remain embeddable by the extension");
}

const isExpectedVersionManifest = (version) => {
  if (allowPreviousVersionManifest) {
    return (
      releasePattern.test(String(version.latestVersion || ""))
      && releasePattern.test(String(version.minimumSupportedVersion || ""))
      && compareVersions(version.minimumSupportedVersion, version.latestVersion) <= 0
      && compareVersions(version.latestVersion, packageJson.version) < 0
      && Number(version.dataSchemaVersion) === 1
    );
  }
  return (
    version.latestVersion === packageJson.version
    && version.minimumSupportedVersion === packageJson.version
  );
};
const { json: version } = await fetchJsonUntil(
  "/latest-version.json",
  isExpectedVersionManifest,
  allowPreviousVersionManifest
    ? `Hosted staging manifest is not a safe predecessor of ${packageJson.version}`
    : `Hosted version manifest does not match ${packageJson.version}`
);

const manifest = await (await fetchWithRetry("/manifest.json")).json();
if (manifest.version !== packageJson.version) throw new Error("Hosted extension metadata does not match the release version");

const webManifestResponse = await fetchWithRetry("/app.webmanifest");
if (!webManifestResponse.headers.get("content-type")?.includes("manifest")) {
  throw new Error("Hosted PWA manifest has an invalid content type");
}
const webManifest = await webManifestResponse.json();
if (
  webManifest.name !== "WhyNavo"
  || webManifest.display !== "standalone"
  || webManifest.start_url !== "./"
  || !Array.isArray(webManifest.icons)
  || !webManifest.icons.some((icon) => icon?.sizes === "512x512")
) throw new Error("Hosted PWA manifest is incomplete");

const { response: serviceWorkerResponse, text: serviceWorker } = await fetchTextUntil(
  "/sw.js",
  (script, response) => (
    script.includes(`whynavo-shell-v${packageJson.version}`)
    && response.headers.get("cache-control") === "no-store"
  ),
  `Hosted Service Worker did not propagate with the ${packageJson.version} cache or no-store policy`,
  12
);
if (serviceWorkerResponse.headers.get("cache-control") !== "no-store") {
  throw new Error("Hosted Service Worker must not be cached by the edge or browser");
}
if (!serviceWorker.includes("captcha.html")) throw new Error("Hosted Service Worker does not isolate CAPTCHA navigation");
if (!serviceWorker.includes("confirm.html")) throw new Error("Hosted Service Worker does not isolate email-confirmation navigation");

const assetPaths = [...homeHtml.matchAll(/(?:src|href)=["']([^"']+\.(?:css|js))["']/g)]
  .map((match) => new URL(match[1], `${origin}/`).pathname);
if (!assetPaths.length) throw new Error("Hosted app does not reference any built assets");
for (const path of new Set(assetPaths)) {
  await fetchTextUntil(
    path,
    (_body, response) => {
      const contentType = response.headers.get("content-type") || "";
      if (path.endsWith(".js")) return contentType.includes("javascript");
      if (path.endsWith(".css")) return contentType.includes("text/css");
      return false;
    },
    `${path} did not propagate with its expected content type`,
    12
  );
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
  await requireDenied(
    "account-bound snapshot read RPC",
    "/rest/v1/rpc/pull_sync_snapshot_for_user",
    {
      method: "POST",
      body: JSON.stringify({
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_name: "primary"
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

console.log(`Hosted smoke test passed for WhyNavo ${packageJson.version}.`);
