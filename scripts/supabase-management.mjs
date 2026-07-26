const MANAGEMENT_API_ORIGIN = "https://api.supabase.com";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_MANAGEMENT_BODY_BYTES = 1024 * 1024;
const READ_ONLY_PROJECT_ENDPOINTS = new Set([
  "config/auth",
  "functions",
  "secrets",
  "advisors/security",
  "network-restrictions",
  "ssl-enforcement"
]);

const requiredEnvironmentValue = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const supabaseProjectRef = () => {
  const value = requiredEnvironmentValue("SUPABASE_PROJECT_REF");
  if (!/^[a-z0-9]{20}$/.test(value)) throw new Error("SUPABASE_PROJECT_REF is invalid");
  return value;
};

export async function managementRequest(path, options = {}) {
  const match = path.match(/^\/v1\/projects\/([a-z0-9]{20})\/([a-z/-]+)$/);
  if (!match || (
    match[2] !== "database/query"
    && !READ_ONLY_PROJECT_ENDPOINTS.has(match[2])
  )) {
    throw new Error("Supabase Management API path is not allow-listed");
  }
  const method = options.method || "GET";
  if (
    (match[2] === "database/query" && method !== "POST")
    || (match[2] !== "database/query" && method !== "GET")
  ) {
    throw new Error("Supabase Management API method is not allowed for this path");
  }
  const encodedBody = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (encodedBody && Buffer.byteLength(encodedBody, "utf8") > MAX_MANAGEMENT_BODY_BYTES) {
    throw new Error("Supabase Management API body exceeds the reviewed size limit");
  }
  const token = requiredEnvironmentValue("SUPABASE_ACCESS_TOKEN");
  const response = await fetch(`${MANAGEMENT_API_ORIGIN}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(encodedBody === undefined ? {} : { "content-type": "application/json" })
    },
    body: encodedBody,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id") || "unavailable";
    throw new Error(`Supabase Management API request failed (${response.status}, request ${requestId})`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

export async function databaseQuery(query) {
  if (typeof query !== "string" || !query.trim() || query.includes("\0")) {
    throw new Error("Supabase database query must be non-empty text");
  }
  const projectRef = supabaseProjectRef();
  return managementRequest(`/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    body: { query }
  });
}
