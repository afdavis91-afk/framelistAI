import { 
  PricingProvider, 
  DualPricingRequest, 
  PriceQuote, 
  Supplier, 
  PricingLocation,
  BaselinePricing,
  PriceTrend
} from "../types";
import { getCostIndex, normalizeMaterial, categorizeMaterial } from "../catalog";

// RSMeans/CCI baseline pricing provider
export class RSMeansProvider implements PricingProvider {
  name = "RSMeans Baseline";
  type = "baseline" as const;
  
  private cache = new Map<string, { data: BaselinePricing; expires: Date }>();
  private readonly CACHE_DURATION_DAYS = 30; // Monthly updates
  
  // Historical RSMeans data (simulated - in production would come from actual RSMeans database)
  private readonly BASE_RSMEANS_PRICES: Record<string, Record<string, number>> = {
    // Lumber prices per board foot (national average)
    "studs": {
      "2x4_8ft_spf": 0.75,
      "2x4_10ft_spf": 0.78,
      "2x6_8ft_spf": 1.15,
      "2x6_10ft_spf": 1.18,
      "2x8_8ft_spf": 1.85,
      "2x10_8ft_spf": 2.45,
      "2x12_8ft_spf": 3.25,
      "default": 0.85
    },
    "plates": {
      "2x4_spf": 0.75,
      "2x6_spf": 1.15,
      "2x8_spf": 1.85,
      "default": 0.85
    },
    "headers": {
      "2x8_spf": 1.85,
      "2x10_spf": 2.45,
      "2x12_spf": 3.25,
      "lvl": 4.50,
      "glulam": 5.25,
      "default": 2.50
    },
    "sheathing": {
      "osb_7/16": 0.65, // per SF
      "osb_5/8": 0.75,
      "plywood_1/2": 1.25,
      "plywood_5/8": 1.45,
      "plywood_3/4": 1.65,
      "default": 0.85
    },
    "blocking": {
      "2x4_spf": 0.75,
      "2x6_spf": 1.15,
      "default": 0.85
    },
    "fasteners": {
      "16d_common": 2.25, // per lb
      "10d_common": 2.35,
      "8d_common": 2.45,
      "galvanized_16d": 3.15,
      "galvanized_10d": 3.25,
      "drywall_screw": 3.85,
      "deck_screw": 4.25,
      "default": 2.75
    },
    "connectors": {
      "joist_hanger": 3.50, // per EA
      "hurricane_tie": 2.25,
      "post_anchor": 8.50,
      "angle_bracket": 4.75,
      "default": 4.00
    }
  };
  
  // Seasonal adjustment factors
  private readonly SEASONAL_FACTORS: Record<number, number> = {
    0: 1.05,  // January - winter premium
    1: 1.03,  // February
    2: 1.00,  // March - baseline
    3: 0.98,  // April - spring building season starts
    4: 0.95,  // May - peak building season
    5: 0.93,  // June - peak season
    6: 0.95,  // July
    7: 0.97,  // August
    8: 0.98,  // September
    9: 1.00,  // October
    10: 1.02, // November - winter approaching
    11: 1.04  // December - winter premium
  };
  
  // Historical price trends (simulated)
  private readonly PRICE_TRENDS: Record<string, PriceTrend> = {
    "studs": { direction: "up", percentChange: 8.5, volatility: 0.25 },
    "plates": { direction: "up", percentChange: 7.2, volatility: 0.20 },
    "headers": { direction: "stable", percentChange: 2.1, volatility: 0.15 },
    "sheathing": { direction: "up", percentChange: 12.3, volatility: 0.35 },
    "blocking": { direction: "up", percentChange: 6.8, volatility: 0.22 },
    "fasteners": { direction: "up", percentChange: 15.2, volatility: 0.40 },
    "connectors": { direction: "stable", percentChange: 3.5, volatility: 0.18 }
  };
  
  async isAvailable(): Promise<boolean> {
    // RSMeans baseline is always available as it's based on historical data
    return true;
  }
  
  async getPricing(request: DualPricingRequest): Promise<PriceQuote[]> {
    const baselinePricing = await this.getBaselinePricing(request);
    
    const normalizedMaterial = normalizeMaterial(request.lineItem);
    const category = categorizeMaterial(request.lineItem.itemId, request.lineItem.material);
    
    // Guard against invalid quantities and prices
    const safeQuantity = Number.isFinite(normalizedMaterial.normalizedQuantity) && normalizedMaterial.normalizedQuantity > 0 
      ? normalizedMaterial.normalizedQuantity : 0;
    const safeCciPrice = Number.isFinite(baselinePricing.cciAdjustedPrice) ? baselinePricing.cciAdjustedPrice : 0;
    const safeWasteFactor = Number.isFinite(request.wasteFactorPct) && request.wasteFactorPct >= 0 
      ? request.wasteFactorPct : 0;
    
    const unitPrice = safeQuantity > 0 ? safeCciPrice / safeQuantity : 0;
    const totalPrice = safeCciPrice * (1 + safeWasteFactor / 100);
    
    // Create a single baseline quote
    const quote: PriceQuote = {
      supplierId: "rsmeans_baseline",
      supplierName: "RSMeans Baseline",
      materialSpec: request.lineItem.material.spec,
      quantity: safeQuantity,
      unit: normalizedMaterial.normalizedUnit,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      totalPrice: Number.isFinite(totalPrice) ? totalPrice : 0,
      availability: "in_stock",
      leadTime: 0, // Baseline pricing doesn't have lead time
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      confidence: baselinePricing.confidence,
      source: "historical",
      metadata: {
        rsMeansPrice: baselinePricing.rsMeansPrice,
        cciAdjustment: request.location.costIndex,
        seasonalFactor: baselinePricing.seasonalFactor,
        historicalTrend: baselinePricing.historicalTrend,
        dataAge: baselinePricing.dataAge,
        category,
        wasteFactorApplied: safeWasteFactor,
        ...(safeQuantity === 0 ? { quantityWarning: "Invalid quantity detected, set to 0" } : {}),
        ...(safeWasteFactor !== request.wasteFactorPct ? { wasteFactorWarning: "Invalid waste factor, using 0%" } : {})
      }
    };
    
    return [quote];
  }
  
  async getSuppliers(location: PricingLocation): Promise<Supplier[]> {
    // RSMeans baseline doesn't have specific suppliers
    return [{
      id: "rsmeans_baseline",
      name: "RSMeans Baseline",
      type: "wholesale",
      locations: [location],
      reliability: 0.95,
      averageDeliveryDays: 0,
      minimumOrder: 0
    }];
  }
  
  async getBaselinePricing(request: DualPricingRequest): Promise<BaselinePricing> {
    const cacheKey = this.getCacheKey(request);
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > new Date()) {
      return cached.data;
    }
    
    const normalizedMaterial = normalizeMaterial(request.lineItem);
    const category = categorizeMaterial(request.lineItem.itemId, request.lineItem.material);
    
    // Get base RSMeans price
    const rsMeansPrice = this.getRSMeansPrice(category, request.lineItem.material.spec, normalizedMaterial);
    
    // Apply CCI adjustment with safety checks
    const costIndex = getCostIndex(request.location.city, request.location.state);
    const safeCostIndex = Number.isFinite(costIndex) ? costIndex : 1.0;
    const safeQuantity = Number.isFinite(normalizedMaterial.normalizedQuantity) && normalizedMaterial.normalizedQuantity > 0 
      ? normalizedMaterial.normalizedQuantity : 0;
    const cciAdjustedPrice = rsMeansPrice * safeCostIndex * safeQuantity;
    
    // Apply seasonal factor
    const currentMonth = new Date().getMonth();
    const seasonalFactor = this.SEASONAL_FACTORS[currentMonth] || 1.0;
    const safeSeasonal = Number.isFinite(seasonalFactor) ? seasonalFactor : 1.0;
    const seasonallyAdjustedPrice = cciAdjustedPrice * safeSeasonal;
    
    // Get historical trend
    const historicalTrend = this.PRICE_TRENDS[category] || { 
      direction: "stable", 
      percentChange: 0, 
      volatility: 0.1 
    };
    
    // Calculate confidence based on data quality
    const confidence = this.calculateConfidence(category, request.location);
    
    const baselinePricing: BaselinePricing = {
      rsMeansPrice,
      cciAdjustedPrice: seasonallyAdjustedPrice,
      historicalTrend,
      seasonalFactor,
      confidence,
      dataAge: this.getDataAge(category),
      source: this.getDataSource(category)
    };
    
    // Cache the result
    this.cache.set(cacheKey, {
      data: baselinePricing,
      expires: new Date(Date.now() + this.CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000)
    });
    
    return baselinePricing;
  }
  
  private getRSMeansPrice(category: string, spec: string, normalizedMaterial: any): number {
    const categoryPrices = this.BASE_RSMEANS_PRICES[category];
    if (!categoryPrices) {
      return this.getDefaultPrice(normalizedMaterial.normalizedUnit);
    }
    
    // Try to match specific spec
    const specKey = this.normalizeSpecForLookup(spec);
    let price = categoryPrices[specKey];
    
    if (!price) {
      // Try partial matches
      for (const [key, value] of Object.entries(categoryPrices)) {
        if (key !== "default" && (spec.toLowerCase().includes(key) || key.includes(spec.toLowerCase()))) {
          price = value;
          break;
        }
      }
    }
    
    // Fall back to category default
    if (!price) {
      price = categoryPrices.default;
    }
    
    // Final fallback
    if (!price) {
      price = this.getDefaultPrice(normalizedMaterial.normalizedUnit);
    }
    
    return price;
  }
  
  private normalizeSpecForLookup(spec: string): string {
    const normalized = spec.toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^\w_]/g, "");
    
    // Common spec normalizations
    if (normalized.includes("2x4")) return "2x4_spf";
    if (normalized.includes("2x6")) return "2x6_spf";
    if (normalized.includes("2x8")) return "2x8_spf";
    if (normalized.includes("2x10")) return "2x10_spf";
    if (normalized.includes("2x12")) return "2x12_spf";
    if (normalized.includes("osb") && normalized.includes("7/16")) return "osb_7/16";
    if (normalized.includes("osb") && normalized.includes("5/8")) return "osb_5/8";
    if (normalized.includes("plywood") && normalized.includes("1/2")) return "plywood_1/2";
    if (normalized.includes("plywood") && normalized.includes("5/8")) return "plywood_5/8";
    if (normalized.includes("plywood") && normalized.includes("3/4")) return "plywood_3/4";
    
    return normalized;
  }
  
  private getDefaultPrice(unit: string): number {
    // Default prices by unit
    switch (unit) {
      case "BF": return 1.00; // Board feet
      case "SF": return 1.00; // Square feet
      case "LF": return 2.00; // Linear feet
      case "LBS": return 3.00; // Pounds
      case "EA": return 2.50; // Each
      default: return 1.00;
    }
  }
  
  private calculateConfidence(category: string, location: PricingLocation): number {
    let confidence = 0.85; // Base confidence for RSMeans data
    
    // Adjust based on category data quality
    const categoryConfidence: Record<string, number> = {
      "studs": 0.90,
      "plates": 0.88,
      "headers": 0.85,
      "sheathing": 0.82,
      "blocking": 0.80,
      "fasteners": 0.75,
      "connectors": 0.78
    };
    
    confidence = categoryConfidence[category] || confidence;
    
    // Adjust based on location data availability
    const hasGoodLocationData = location.costIndex !== 1.0; // Has specific CCI data
    if (!hasGoodLocationData) {
      confidence *= 0.9; // Reduce confidence for locations without specific CCI data
    }
    
    // Adjust based on data age
    const dataAge = this.getDataAge(category);
    if (dataAge > 90) {
      confidence *= 0.85; // Reduce confidence for older data
    } else if (dataAge > 30) {
      confidence *= 0.95;
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }
  
  private getDataAge(category: string): number {
    // Simulate data age in days (in production would track actual data updates)
    const dataAges: Record<string, number> = {
      "studs": 15,
      "plates": 18,
      "headers": 22,
      "sheathing": 12,
      "blocking": 25,
      "fasteners": 8,
      "connectors": 30
    };
    
    return dataAges[category] || 20;
  }
  
  private getDataSource(category: string): "rsmeans" | "cci" | "historical" | "estimated" {
    // Simulate data source quality
    const highQualityCategories = ["studs", "plates", "sheathing"];
    const mediumQualityCategories = ["headers", "blocking"];
    
    if (highQualityCategories.includes(category)) {
      return "rsmeans";
    } else if (mediumQualityCategories.includes(category)) {
      return "cci";
    } else {
      return "historical";
    }
  }
  
  private getCacheKey(request: DualPricingRequest): string {
    const category = categorizeMaterial(request.lineItem.itemId, request.lineItem.material);
    return `${category}-${request.lineItem.material.spec}-${request.location.city}-${request.location.state}`;
  }
  
  // Get market trend analysis
  getMarketTrends(category: string): PriceTrend {
    return this.PRICE_TRENDS[category] || { 
      direction: "stable", 
      percentChange: 0, 
      volatility: 0.1 
    };
  }
  
  // Get seasonal pricing forecast
  getSeasonalForecast(months: number = 12): Record<number, number> {
    const forecast: Record<number, number> = {};
    const currentMonth = new Date().getMonth();
    
    for (let i = 0; i < months; i++) {
      const month = (currentMonth + i) % 12;
      forecast[i] = this.SEASONAL_FACTORS[month];
    }
    
    return forecast;
  }
  
  // Clear cache
  clearCache(): void {
    this.cache.clear();
  }
}

export const rsMeansProvider = new RSMeansProvider();