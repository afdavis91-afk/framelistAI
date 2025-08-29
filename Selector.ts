import { PriceQuote } from "./PriceQuote";

export interface SelectorOptions {
  maxQuoteAgeDays: number;
  minAccept: number;
  preferVendors?: string[];
  requireInStock?: boolean;
}

const clamp = (min: number, max: number, v: number) => Math.max(min, Math.min(max, v));
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (d1: string, d2: string) =>
  Math.floor((+new Date(d2) - +new Date(d1)) / 86400000);

export function scoreQuote(q: PriceQuote, o: SelectorOptions): number {
  const age = Math.max(0, daysBetween(q.priceAsOf, today()));
  const freshness = clamp(0, 1, 1 - (age / Math.max(1, o.maxQuoteAgeDays)));
  const vendor = q.vendorReliability ?? 0.6;
  const parsing = q.parsingScore ?? 0.7;
  const stock = q.stock === "IN_STOCK" ? 1 : q.stock === "LIMITED" ? 0.7 : 0.3;
  const prefBoost = (o.preferVendors?.includes(q.vendor) ? 0.1 : 0);
  return clamp(0.0001, 1, 0.35 * freshness + 0.35 * vendor + 0.2 * parsing + 0.1 * stock + prefBoost);
}

export function weightedMedian(values: number[], weights: number[]): number {
  const arr = values.map((p, i) => ({ p, w: weights[i] })).sort((a, b) => a.p - b.p);
  const total = arr.reduce((s, a) => s + a.w, 0);
  let cum = 0;
  for (const a of arr) { cum += a.w; if (cum >= total / 2) return a.p; }
  return arr[arr.length - 1]?.p ?? NaN;
}

function weightedPercentile(values: number[], weights: number[], pct: number): number {
  const arr = values.map((p, i) => ({ p, w: weights[i] })).sort((a, b) => a.p - b.p);
  const total = arr.reduce((s, a) => s + a.w, 0);
  let cum = 0;
  for (const a of arr) { cum += a.w; if (cum >= total * pct) return a.p; }
  return arr[arr.length - 1]?.p ?? NaN;
}

export function selectPrice(unitPrices: number[], quotes: PriceQuote[], o: SelectorOptions) {
  const filtered: { p: number; q: PriceQuote; w: number }[] = [];
  unitPrices.forEach((p, i) => {
    const q = quotes[i];
    if (!isFinite(p)) return;
    if (o.requireInStock && q.stock !== "IN_STOCK") return;
    filtered.push({ p, q, w: scoreQuote(q, o) });
  });
  if (!filtered.length) return { unitPrice: NaN, score: 0, p25: NaN, p75: NaN, used: [] };

  const prices = filtered.map(x => x.p);
  const weights = filtered.map(x => x.w);

  const p50 = weightedMedian(prices, weights);
  const p25 = weightedPercentile(prices, weights, 0.25);
  const p75 = weightedPercentile(prices, weights, 0.75);
  const spread = (p75 - p25) / Math.max(1e-6, p50);
  const score = clamp(0, 1, 1 - spread);

  return { unitPrice: p50, score, p25, p75, used: filtered.map(x => x.q) };
}
