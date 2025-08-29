const MARKET_IDX: Record<string, number> = {
  // seed with a few; allow overrides in store
  "Seattle-Tacoma-Bellevue, WA": 1.00,
  "Portland-Vancouver-Hillsboro, OR-WA": 0.95,
  "San Francisco-Oakland-Berkeley, CA": 1.08,
  "Denver-Aurora-Lakewood, CO": 1.12,
  "New York-Newark-Jersey City, NY-NJ-PA": 1.15,
  "Los Angeles-Long Beach-Anaheim, CA": 1.10,
  "Chicago-Naperville-Elgin, IL-IN-WI": 1.05,
  "Houston-The Woodlands-Sugar Land, TX": 0.98,
  "Phoenix-Mesa-Chandler, AZ": 0.95,
  "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD": 1.08,
};

export function lookupMarketIdx(region?: string): number {
  if (!region) return 1.0;
  return MARKET_IDX[region] ?? 1.0;
}

export function regionalize(baseUnitPrice: number, region?: string): number {
  return baseUnitPrice * lookupMarketIdx(region);
}
