export type UsdCurrencyRates = {
  base: "USD";
  rates: Record<string, number>;
  fetchedAt: number;
  source: string;
  date?: string;
};

const CACHE_KEY = "muTravelUsdCurrencyRates";
const TTL_MS = 24 * 60 * 60 * 1000;
const ATTEMPT_KEY = "muTravelUsdCurrencyRatesLastAttempt";
const RETRY_BACKOFF_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
let inFlight: Promise<UsdCurrencyRates | null> | undefined;
let lastAttempt = -Infinity;
const PRIMARY_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
const FALLBACK_URL = "https://api.fxratesapi.com/latest?base=USD";

export async function loadUsdCurrencyRates(now = Date.now()): Promise<UsdCurrencyRates | null> {
  if (inFlight) return inFlight;
  const operation = loadRates(now);
  inFlight = operation;
  try {
    return await operation;
  } finally {
    inFlight = undefined;
  }
}

async function loadRates(now: number): Promise<UsdCurrencyRates | null> {
  const cached = await readCachedRates();
  if (cached && now >= cached.fetchedAt && now - cached.fetchedAt < TTL_MS) return cached;
  try {
    const stored = await chrome.storage.local.get(ATTEMPT_KEY);
    const attempt = stored[ATTEMPT_KEY];
    if (typeof attempt === "number" && Number.isFinite(attempt)) lastAttempt = Math.max(lastAttempt, attempt);
  } catch {
    /* The per-page attempt remains a fallback when storage is unavailable. */
  }
  if (now >= lastAttempt && now - lastAttempt < RETRY_BACKOFF_MS) return cached;
  lastAttempt = now;
  try {
    await chrome.storage.local.set({ [ATTEMPT_KEY]: now });
  } catch {
    /* Best effort. */
  }
  const fetched = await fetchUsdCurrencyRates(now);
  if (fetched) {
    await writeCachedRates(fetched);
    return fetched;
  }
  return cached;
}

async function fetchUsdCurrencyRates(now: number): Promise<UsdCurrencyRates | null> {
  return (
    (await fetchAndParseRates(PRIMARY_URL, "jsdelivr-currency-api", parseJsdelivrRates, now)) ||
    (await fetchAndParseRates(FALLBACK_URL, "fxratesapi", parseFxRatesApiRates, now))
  );
}

async function fetchAndParseRates(
  url: string,
  source: string,
  parser: (body: unknown, fetchedAt: number, source: string) => UsdCurrencyRates | null,
  now: number,
): Promise<UsdCurrencyRates | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) return null;
    return parser(await response.json(), now, source);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsdelivrRates(body: unknown, fetchedAt: number, source: string): UsdCurrencyRates | null {
  if (!isRecord(body) || !isRecord(body.usd)) return null;
  return normalizeRates(body.usd, fetchedAt, source, typeof body.date === "string" ? body.date : undefined);
}

function parseFxRatesApiRates(body: unknown, fetchedAt: number, source: string): UsdCurrencyRates | null {
  if (!isRecord(body) || !isRecord(body.rates)) return null;
  return normalizeRates(body.rates, fetchedAt, source, typeof body.date === "string" ? body.date : undefined);
}

function normalizeRates(
  value: Record<string, unknown>,
  fetchedAt: number,
  source: string,
  date?: string,
): UsdCurrencyRates | null {
  const rates: Record<string, number> = { USD: 1 };
  for (const [currency, rate] of Object.entries(value)) {
    const code = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    rates[code] = rate;
  }
  return Object.keys(rates).length > 1 ? { base: "USD", rates, fetchedAt, source, date } : null;
}

async function readCachedRates(): Promise<UsdCurrencyRates | null> {
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    return normalizeCachedRates(stored[CACHE_KEY]);
  } catch {
    return null;
  }
}

async function writeCachedRates(rates: UsdCurrencyRates): Promise<void> {
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: rates });
  } catch {
    // FX rates are an optimization; mileage estimates still render without them.
  }
}

function normalizeCachedRates(value: unknown): UsdCurrencyRates | null {
  if (
    !isRecord(value) ||
    !isRecord(value.rates) ||
    typeof value.fetchedAt !== "number" ||
    !Number.isFinite(value.fetchedAt)
  )
    return null;
  return normalizeRates(
    value.rates,
    value.fetchedAt,
    typeof value.source === "string" ? value.source : "cache",
    typeof value.date === "string" ? value.date : undefined,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
