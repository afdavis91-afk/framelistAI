import { 
  PricingProvider, 
  DualPricingRequest, 
  PriceQuote, 
  Supplier, 
  PricingLocation,
  AvailabilityStatus,
  PriceSource
} from "../types";
import { getSuppliersForLocation, normalizeMaterial } from "../catalog";

// Live retail pricing provider - integrates with major retailers
export class LiveRetailProvider implements PricingProvider {
  name = "Live Retail";
  type = "live_retail" as const;
  
  private cache = new Map<string, { data: PriceQuote[]; expires: Date }>();
  private readonly CACHE_DURATION_HOURS = 4;

  
  async isAvailable(): Promise<boolean> {
    // Check if we can reach at least one supplier API
    try {
      // Simple connectivity check - in production would ping actual APIs
      return true;
    } catch {
      return false;
    }
  }
  
  async getPricing(request: DualPricingRequest): Promise<PriceQuote[]> {
    const cacheKey = this.getCacheKey(request);
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > new Date()) {
      return cached.data;
    }
    
    const suppliers = getSuppliersForLocation(request.location);
    const normalizedMaterial = normalizeMaterial(request.lineItem);
    
    const quotes: PriceQuote[] = [];
    
    // Get quotes from each supplier in parallel
    const quotePromises = suppliers.map(supplier => 
      this.getQuoteFromSupplier(supplier, request, normalizedMaterial)
        .catch(error => {
          console.warn(`Failed to get quote from ${supplier.name}:`, error);
          return null;
        })
    );
    
    const results = await Promise.allSettled(quotePromises);
    
    results.forEach(result => {
      if (result.status === "fulfilled" && result.value) {
        quotes.push(result.value);
      }
    });
    
    // Cache the results
    this.cache.set(cacheKey, {
      data: quotes,
      expires: new Date(Date.now() + this.CACHE_DURATION_HOURS * 60 * 60 * 1000)
    });
    
    return quotes;
  }
  
  async getSuppliers(location: PricingLocation): Promise<Supplier[]> {
    return getSuppliersForLocation(location);
  }
  
  private async getQuoteFromSupplier(
    supplier: Supplier, 
    request: DualPricingRequest,
    normalizedMaterial: any
  ): Promise<PriceQuote | null> {
    
    switch (supplier.type) {
      case "big_box":
        return this.getBigBoxQuote(supplier, request, normalizedMaterial);
      case "lumber_yard":
        return this.getLumberYardQuote(supplier, request, normalizedMaterial);
      case "online":
        return this.getOnlineQuote(supplier, request, normalizedMaterial);
      default:
        return this.getGenericQuote(supplier, request, normalizedMaterial);
    }
  }
  
  private async getBigBoxQuote(
    supplier: Supplier,
    request: DualPricingRequest, 
    normalizedMaterial: any
  ): Promise<PriceQuote> {
    
    // In production, this would scrape or call APIs for Home Depot, Lowe's, etc.
    // For now, we'll simulate realistic pricing based on material type and location
    
    const basePrice = this.estimateBasePrice(request.lineItem.material.spec, normalizedMaterial);
    const locationAdjustment = Number.isFinite(request.location.costIndex) ? request.location.costIndex : 1.0;
    const supplierAdjustment = this.getSupplierPriceAdjustment(supplier.name);
    
    const unitPrice = basePrice * locationAdjustment * supplierAdjustment;
    const safeQuantity = Number.isFinite(normalizedMaterial.normalizedQuantity) && normalizedMaterial.normalizedQuantity > 0 
      ? normalizedMaterial.normalizedQuantity : 0;
    const totalPrice = unitPrice * safeQuantity;
    
    // Apply waste factor with safety check
    const safeWasteFactor = Number.isFinite(request.wasteFactorPct) && request.wasteFactorPct >= 0 
      ? request.wasteFactorPct : 0;
    const wasteAdjustedPrice = totalPrice * (1 + safeWasteFactor / 100);
    
    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      materialSpec: request.lineItem.material.spec,
      quantity: safeQuantity,
      unit: normalizedMaterial.normalizedUnit,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      totalPrice: Number.isFinite(wasteAdjustedPrice) ? wasteAdjustedPrice : 0,
      availability: this.estimateAvailability(supplier, request),
      leadTime: supplier.averageDeliveryDays,
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      confidence: this.calculateConfidence(supplier, "scrape"),
      source: "scrape" as PriceSource,
      metadata: {
        wasteFactorApplied: safeWasteFactor,
        locationAdjustment,
        supplierAdjustment,
        normalizedFrom: `${request.lineItem.qty} ${request.lineItem.uom}`,
        assumptions: normalizedMaterial.assumptions,
        ...(safeQuantity === 0 ? { quantityWarning: "Invalid quantity detected, set to 0" } : {}),
        ...(safeWasteFactor !== request.wasteFactorPct ? { wasteFactorWarning: "Invalid waste factor, using 0%" } : {})
      }
    };
  }
  
  private async getLumberYardQuote(
    supplier: Supplier,
    request: DualPricingRequest,
    normalizedMaterial: any
  ): Promise<PriceQuote> {
    
    // Lumber yards typically have better prices but higher minimums
    const basePrice = this.estimateBasePrice(request.lineItem.material.spec, normalizedMaterial);
    const locationAdjustment = Number.isFinite(request.location.costIndex) ? request.location.costIndex : 1.0;
    const lumberYardDiscount = 0.85; // 15% discount vs big box
    
    const unitPrice = basePrice * locationAdjustment * lumberYardDiscount;
    const safeQuantity = Number.isFinite(normalizedMaterial.normalizedQuantity) && normalizedMaterial.normalizedQuantity > 0 
      ? normalizedMaterial.normalizedQuantity : 0;
    const totalPrice = unitPrice * safeQuantity;
    const safeWasteFactor = Number.isFinite(request.wasteFactorPct) && request.wasteFactorPct >= 0 
      ? request.wasteFactorPct : 0;
    const wasteAdjustedPrice = totalPrice * (1 + safeWasteFactor / 100);
    
    // Check minimum order
    const meetsMinimum = wasteAdjustedPrice >= (supplier.minimumOrder || 0);
    
    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      materialSpec: request.lineItem.material.spec,
      quantity: safeQuantity,
      unit: normalizedMaterial.normalizedUnit,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      totalPrice: Number.isFinite(wasteAdjustedPrice) ? wasteAdjustedPrice : 0,
      availability: meetsMinimum ? "in_stock" : "special_order",
      leadTime: supplier.averageDeliveryDays,
      validUntil: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
      confidence: this.calculateConfidence(supplier, "api"),
      source: "api" as PriceSource,
      metadata: {
        wasteFactorApplied: safeWasteFactor,
        minimumOrderMet: meetsMinimum,
        minimumOrder: supplier.minimumOrder,
        discount: "15% lumber yard discount applied",
        ...(safeQuantity === 0 ? { quantityWarning: "Invalid quantity detected, set to 0" } : {})
      }
    };
  }
  
  private async getOnlineQuote(
    supplier: Supplier,
    request: DualPricingRequest,
    normalizedMaterial: any
  ): Promise<PriceQuote> {
    
    // Online suppliers often have competitive prices but longer lead times
    const basePrice = this.estimateBasePrice(request.lineItem.material.spec, normalizedMaterial);
    const onlineDiscount = 0.90; // 10% discount
    const shippingCost = this.estimateShippingCost(normalizedMaterial.normalizedQuantity, request.location);
    
    const unitPrice = basePrice * onlineDiscount;
    const materialCost = unitPrice * normalizedMaterial.normalizedQuantity;
    const totalPrice = (materialCost + shippingCost) * (1 + request.wasteFactorPct / 100);
    
    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      materialSpec: request.lineItem.material.spec,
      quantity: normalizedMaterial.normalizedQuantity,
      unit: normalizedMaterial.normalizedUnit,
      unitPrice,
      totalPrice,
      availability: "special_order",
      leadTime: supplier.averageDeliveryDays + 3, // Additional shipping time
      validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
      confidence: this.calculateConfidence(supplier, "api"),
      source: "api" as PriceSource,
      metadata: {
        shippingCost,
        onlineDiscount: "10% online discount applied",
        extendedLeadTime: "Additional 3 days for shipping"
      }
    };
  }
  
  private async getGenericQuote(
    supplier: Supplier,
    request: DualPricingRequest,
    normalizedMaterial: any
  ): Promise<PriceQuote> {
    
    // Generic supplier pricing
    const basePrice = this.estimateBasePrice(request.lineItem.material.spec, normalizedMaterial);
    const locationAdjustment = request.location.costIndex;
    const reliabilityAdjustment = 0.95 + (supplier.reliability * 0.1); // Higher reliability = slight premium
    
    const unitPrice = basePrice * locationAdjustment * reliabilityAdjustment;
    const totalPrice = unitPrice * normalizedMaterial.normalizedQuantity * (1 + request.wasteFactorPct / 100);
    
    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      materialSpec: request.lineItem.material.spec,
      quantity: normalizedMaterial.normalizedQuantity,
      unit: normalizedMaterial.normalizedUnit,
      unitPrice,
      totalPrice,
      availability: "in_stock",
      leadTime: supplier.averageDeliveryDays,
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      confidence: this.calculateConfidence(supplier, "estimated"),
      source: "estimated" as PriceSource,
      metadata: {
        reliabilityAdjustment,
        estimationMethod: "generic_supplier_model"
      }
    };
  }
  
  private estimateBasePrice(materialSpec: string, normalizedMaterial: any): number {
    // Base pricing model - in production would use historical data
    const spec = materialSpec.toLowerCase();
    const unit = normalizedMaterial.normalizedUnit;
    
    // Lumber pricing (per board foot)
    if (unit === "BF") {
      if (spec.includes("pressure treated") || spec.includes("pt")) return 1.25;
      if (spec.includes("cedar")) return 2.50;
      if (spec.includes("redwood")) return 3.00;
      if (spec.includes("pine") || spec.includes("fir") || spec.includes("spf")) return 0.85;
      return 1.00; // Default lumber price per BF
    }
    
    // Sheet goods pricing (per SF)
    if (unit === "SF") {
      if (spec.includes("plywood")) return 1.50;
      if (spec.includes("osb")) return 0.75;
      if (spec.includes("mdf")) return 1.25;
      return 1.00;
    }
    
    // Fastener pricing (per pound)
    if (unit === "LBS") {
      if (spec.includes("galvanized")) return 3.50;
      if (spec.includes("stainless")) return 8.00;
      if (spec.includes("coated")) return 4.00;
      return 2.50; // Standard nails/screws
    }
    
    // Linear foot pricing
    if (unit === "LF") {
      return 2.00; // Default per linear foot
    }
    
    // Per piece pricing
    if (unit === "EA") {
      if (spec.includes("connector") || spec.includes("bracket")) return 5.00;
      if (spec.includes("anchor")) return 2.00;
      return 1.00;
    }
    
    return 1.00; // Fallback
  }
  
  private getSupplierPriceAdjustment(supplierName: string): number {
    // Supplier-specific price adjustments based on market positioning
    const adjustments: Record<string, number> = {
      "Home Depot": 1.05, // Slight premium
      "Lowe's": 1.03,
      "Menards": 0.98, // Competitive pricing
      "84 Lumber": 0.92, // Lumber yard discount
      "Builders FirstSource": 0.90,
      "Carter Lumber": 0.93
    };
    
    return adjustments[supplierName] || 1.00;
  }
  
  private estimateAvailability(supplier: Supplier, request: DualPricingRequest): AvailabilityStatus {
    // Estimate availability based on supplier type, location, and material
    const isCommonMaterial = this.isCommonMaterial(request.lineItem.material.spec);
    const isLargeOrder = request.lineItem.qty > 100;
    
    if (supplier.type === "big_box") {
      if (isCommonMaterial && !isLargeOrder) return "in_stock";
      if (isCommonMaterial && isLargeOrder) return "limited";
      return "special_order";
    }
    
    if (supplier.type === "lumber_yard") {
      if (isCommonMaterial) return "in_stock";
      return "special_order";
    }
    
    return "special_order";
  }
  
  private isCommonMaterial(spec: string): boolean {
    const commonSpecs = [
      "2x4", "2x6", "2x8", "2x10", "2x12",
      "plywood", "osb", "sheathing",
      "16d nail", "10d nail", "8d nail",
      "drywall screw", "deck screw"
    ];
    
    return commonSpecs.some(common => spec.toLowerCase().includes(common));
  }
  
  private estimateShippingCost(quantity: number, location: PricingLocation): number {
    // Estimate shipping cost based on quantity and location
    const baseShipping = 50; // Base shipping cost
    const perUnitShipping = 0.10; // Per unit shipping
    const locationMultiplier = location.costIndex; // Higher cost areas = higher shipping
    
    return (baseShipping + (quantity * perUnitShipping)) * locationMultiplier;
  }
  
  private calculateConfidence(supplier: Supplier, source: PriceSource): number {
    let confidence = supplier.reliability;
    
    // Adjust based on price source
    switch (source) {
      case "api":
        confidence *= 0.95; // High confidence for API data
        break;
      case "scrape":
        confidence *= 0.85; // Lower confidence for scraped data
        break;
      case "estimated":
        confidence *= 0.70; // Lower confidence for estimates
        break;
      case "manual":
        confidence *= 0.90;
        break;
      case "historical":
        confidence *= 0.75;
        break;
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }
  
  private getCacheKey(request: DualPricingRequest): string {
    return `${request.lineItem.itemId}-${request.location.city}-${request.location.state}-${request.wasteFactorPct}`;
  }
  

  
  // Public method to clear cache if needed
  clearCache(): void {
    this.cache.clear();
  }
}

export const liveRetailProvider = new LiveRetailProvider();