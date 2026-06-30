let cachedRates: Record<string, number> = {};
let cacheExpiry = 0;

// Base currency: USD. Rates = how many USD per 1 unit of that currency.
async function fetchRates(): Promise<Record<string, number>> {
  const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD', {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Exchange rate fetch failed: ${res.status}`);
  const data = await res.json();
  // data.rates is { EUR: 0.9, INR: 83.5, ... } — units per 1 USD
  // We want USD per 1 unit, so invert each rate
  const rates: Record<string, number> = { USD: 1 };
  for (const [currency, rate] of Object.entries(data.rates as Record<string, number>)) {
    rates[currency] = 1 / rate;
  }
  return rates;
}

export async function getUsdRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (now < cacheExpiry && Object.keys(cachedRates).length > 0) {
    return cachedRates;
  }
  try {
    cachedRates = await fetchRates();
    cacheExpiry = now + 60 * 60 * 1000; // 1 hour
  } catch {
    // Keep stale cache if available; otherwise use approximate fallback rates
    if (Object.keys(cachedRates).length === 0) {
      cachedRates = {
        USD: 1, INR: 0.012, EUR: 1.08, GBP: 1.27, CAD: 0.74, AUD: 0.65,
        JPY: 0.0067, KRW: 0.00075, BRL: 0.18, MXN: 0.058, SGD: 0.74,
        HKD: 0.128, NOK: 0.093, SEK: 0.095, DKK: 0.145, CHF: 1.11,
        NZD: 0.60, ZAR: 0.055, AED: 0.272, SAR: 0.267,
      };
    }
  }
  return cachedRates;
}

export function convertToUsd(amount: number, currency: string, rates: Record<string, number>): number {
  const rate = rates[currency.toUpperCase()] ?? rates['USD'] ?? 1;
  return amount * rate;
}
