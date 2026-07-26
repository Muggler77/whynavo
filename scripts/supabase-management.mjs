const MANAGEMENT_API_ORIGIN = "https://api.supabase.com";
const REQUEST_TIMEOUT_MS = 30_000;

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
  const token = requiredEnvironmentValue("SUPABASE_ACCESS_TOKEN");
  const response = await fetch(`${MANAGEMENT_API_ORIGIN}${path}`, {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { "content-type": "application/json" })
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
  const projectRef = supabaseProjectRef();
  return managementRequest(`/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    body: { query }
  });
}
