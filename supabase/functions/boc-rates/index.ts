import { createClient } from "jsr:@supabase/supabase-js@2.110.8";

const OFFICIAL_WEB_ORIGIN = "https://whynavo.com";
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const readNamedKeys = (name: string, legacyName: string) => {
  try {
    const keys = JSON.parse(Deno.env.get(name) || "{}") as Record<string, unknown>;
    const values = Object.values(keys).filter((value): value is string => typeof value === "string" && Boolean(value));
    if (values.length) return values;
  } catch {
    // Fall through to legacy project keys during staged key migration.
  }
  const legacy = Deno.env.get(legacyName);
  return legacy ? [legacy] : [];
};
const allowedOrigin = (origin: string | null) => (
  origin === OFFICIAL_WEB_ORIGIN
  || EXTENSION_ORIGIN.test(origin)
  || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)
);
const responseHeaders = (origin: string | null) => ({
  "access-control-allow-origin": origin || OFFICIAL_WEB_ORIGIN,
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "public, max-age=300, stale-while-revalidate=3600",
  "vary": "Origin"
});

type RateRow = {
  currency: "USD" | "JPY";
  name: string;
  cashBuyingRate?: string;
  buyingRate?: string;
  sellingRate?: string;
  cashSellingRate?: string;
  publishAt?: string;
};

type RatePayload = {
  rows: RateRow[];
  updatedAt: string;
  source: string;
};

let memoryCache: { payload: RatePayload; fetchedAt: number } | undefined;

const decodeBocHtml = (buffer: ArrayBuffer) => {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (utf8.includes("美元") || utf8.includes("日元")) return utf8;
  return new TextDecoder("gb18030").decode(buffer);
};

const extractCellText = (cellHtml: string) => (
  [...cellHtml.matchAll(/(?:^|>)([^<>]+)(?=<|$)/g)]
    .map((match) => match[1].replaceAll("&nbsp;", " ").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
);

function parseRows(html: string): RateRow[] {
  const targets: Record<string, RateRow["currency"]> = {
    "美元": "USD",
    "日元": "JPY"
  };

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => extractCellText(cell[1])))
    .filter((cells) => cells.length >= 7);

  return rows
    .map((cells) => {
      const currency = targets[cells[0]];
      if (!currency) return undefined;
      const publishAt = cells[7] && !cells[6]?.includes(cells[7])
        ? `${cells[6] || ""} ${cells[7]}`.trim()
        : (cells[6] || cells[7] || "").trim();
      return {
        currency,
        name: cells[0],
        buyingRate: cells[1],
        cashBuyingRate: cells[2],
        sellingRate: cells[3],
        cashSellingRate: cells[4],
        publishAt
      };
    })
    .filter(Boolean) as RateRow[];
}

const validRateRow = (row: RateRow) => {
  const quoteFields = [row.buyingRate, row.cashBuyingRate, row.sellingRate, row.cashSellingRate];
  return quoteFields.every((value) => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))
    && typeof row.publishAt === "string"
    && /^\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(row.publishAt);
};

const validRatePayload = (value: unknown): value is RatePayload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<RatePayload>;
  return Array.isArray(payload.rows)
    && payload.rows.length === 2
    && new Set(payload.rows.map((row) => row?.currency)).size === 2
    && payload.rows.every((row) => Boolean(row) && validRateRow(row))
    && typeof payload.updatedAt === "string"
    && Number.isFinite(Date.parse(payload.updatedAt))
    && typeof payload.source === "string"
    && payload.source.length > 0
    && payload.source.length <= 100;
};

async function readBoundedBody(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_SOURCE_BYTES) throw new Error("rate source response is too large");
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new Error("rate source response is too large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = responseHeaders(origin);
  if (!allowedOrigin(origin)) return Response.json({ error: "origin not allowed" }, { status: 403, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405, headers });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeys = readNamedKeys("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  if (!publishableKeys.includes(req.headers.get("apikey") || "")) {
    return Response.json({ error: "invalid client key" }, { status: 401, headers: { ...headers, "cache-control": "no-store" } });
  }
  const [serviceKey] = readNamedKeys("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "service is not configured" }, { status: 500, headers: { ...headers, "cache-control": "no-store" } });
  }
  if (memoryCache && Date.now() - memoryCache.fetchedAt < 6 * 60 * 60 * 1000) {
    return Response.json(memoryCache.payload, { headers });
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  let stalePayload: RatePayload | undefined = memoryCache?.payload;

  const { data } = await supabase
    .from("exchange_rate_cache")
    .select("payload, fetched_at")
    .eq("id", "boc-usd-jpy")
    .maybeSingle();
  if (validRatePayload(data?.payload)) {
    stalePayload = data.payload;
    const fetchedAt = new Date(data?.fetched_at || 0).getTime();
    if (Number.isFinite(fetchedAt)) memoryCache = { payload: stalePayload, fetchedAt };
  }
  if (stalePayload && Date.now() - new Date(data?.fetched_at || 0).getTime() < 6 * 60 * 60 * 1000) {
    return Response.json(stalePayload, { headers });
  }

  try {
    const response = await fetch("https://www.boc.cn/sourcedb/whpj/", {
      signal: AbortSignal.timeout(12_000),
      headers: { "user-agent": "whynavo-rates/1.0" }
    });
    if (!response.ok) throw new Error(`rate source returned ${response.status}`);
    const sourceBytes = await readBoundedBody(response);
    const html = decodeBocHtml(sourceBytes.buffer as ArrayBuffer);
    const rows = parseRows(html);
    if (rows.length !== 2 || !rows.every(validRateRow)) throw new Error("rate source format changed");
    const payload = {
      rows,
      updatedAt: new Date().toISOString(),
      source: "中国银行外汇牌价"
    };

    await supabase.from("exchange_rate_cache").upsert({
      id: "boc-usd-jpy",
      payload,
      fetched_at: new Date().toISOString()
    });

    memoryCache = { payload, fetchedAt: Date.now() };
    return Response.json(payload, { headers });
  } catch {
    if (stalePayload) {
      return Response.json({ ...stalePayload, stale: true }, { headers: { ...headers, "cache-control": "no-cache" } });
    }
    return Response.json(
      { rows: [], updatedAt: new Date().toISOString(), source: "中国银行" },
      { status: 502, headers: { ...headers, "cache-control": "no-store" } }
    );
  }
});
