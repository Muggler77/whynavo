import { cacheRates, readRates } from "./db";
import type { RatesState } from "./types";

const MAX_RATES_RESPONSE_BYTES = 256 * 1024;
const RATES_REQUEST_TIMEOUT_MS = 12_000;
const RATE_FIELDS = ["name", "cashBuyingRate", "buyingRate", "sellingRate", "cashSellingRate", "publishAt"] as const;

const isRatesState = (value: unknown): value is RatesState => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<RatesState>;
  if (
    !Array.isArray(state.rows)
    || state.rows.length !== 2
    || typeof state.updatedAt !== "string"
    || !Number.isFinite(Date.parse(state.updatedAt))
    || typeof state.source !== "string"
    || state.source.length > 500
    || (state.stale !== undefined && typeof state.stale !== "boolean")
  ) return false;
  const currencies = new Set<string>();
  return state.rows.every((row) => {
    if (!row || (row.currency !== "USD" && row.currency !== "JPY") || currencies.has(row.currency)) return false;
    currencies.add(row.currency);
    return RATE_FIELDS.every((field) => (
      field === "name"
        ? typeof row[field] === "string" && row[field].length > 0 && row[field].length <= 100
        : row[field] === undefined || (typeof row[field] === "string" && row[field].length <= 100)
    ));
  });
};

export async function fetchRates(supabaseUrl?: string, anonKey?: string): Promise<RatesState> {
  if (!supabaseUrl || !anonKey) {
    const cached = await readRates<RatesState>();
    if (cached) return cached;
    throw new Error("需要先配置 Supabase，汇率由云函数抓取中国银行数据");
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/boc-rates`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), RATES_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        apikey: anonKey
      },
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) throw new Error("汇率云函数暂时不可用");
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_RATES_RESPONSE_BYTES) throw new Error("汇率响应异常");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RATES_RESPONSE_BYTES) throw new Error("汇率响应异常");
  const rates = JSON.parse(text) as unknown;
  if (!isRatesState(rates)) throw new Error("汇率响应格式异常");
  await cacheRates(rates);
  return rates;
}

export async function getCachedRates() {
  const rates = await readRates<unknown>();
  return isRatesState(rates) ? rates : undefined;
}
