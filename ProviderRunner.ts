import { SpecKey, toStableKey } from "./SpecKey";
import { Qty } from "./Uom";
import { PriceQuote } from "./PriceQuote";
import { regionalize } from "./RegionIndex";
import { landedUnitPrice } from "./Landed";
import { selectPrice, SelectorOptions } from "./Selector";
import { blend } from "./Blend";
import { createLedgerEntry, LedgerEntry } from "./Ledger";
import { pricingOrchestrator } from "./index";
import { TakeoffLineItem } from "../types/construction";

export interface PricingRequest {
  specKey: SpecKey;
  qty: Qty;
  options: {
    useRegionalIndex: boolean;
    useLanded: boolean;
    blendCatalogLive: number; // 0..1
    requireInStock: boolean;
    maxQuoteAgeDays: number;
    minAccept: number;
    priceAsOf?: string;
    currency: "USD";
    fxRate?: number;
    preferVendors?: string[];
  };
  projectZip?: string;
}

export interface PricingResult {
  unitPrice: number;
  score: number;
  p25: number;
  p75: number;
  quotes: PriceQuote[];
  selectionBasis: "CATALOG" | "LIVE" | "BLENDED";
  specKeyStable: string;
  ledger: LedgerEntry[];
}

export class ProviderRunner {
  private ledger: LedgerEntry[] = [];

  async getBestQuotes(request: PricingRequest): Promise<PricingResult> {
    const specKeyStable = toStableKey(request.specKey);
    
    // Clear previous ledger entries for this spec
    this.ledger = [];
    
    // Log initial assumption
    this.addLedgerEntry("ASSUMPTION", specKeyStable, "Pricing request initiated", {
      specKey: request.specKey,
      qty: request.qty,
      options: request.options,
      projectZip: request.projectZip
    });

    try {
      // Convert SpecKey to TakeoffLineItem for existing orchestrator
      const lineItem = this.specKeyToLineItem(request.specKey, request.qty);
      
      // Get default preferences
      const preferences = pricingOrchestrator.getDefaultPreferences();
      
      // Get dual pricing from existing orchestrator
      const comparison = await pricingOrchestrator.getDualPricing(lineItem, preferences);
      
      // Convert to our PriceQuote format
      const catalogQuotes: PriceQuote[] = [];
      const liveQuotes: PriceQuote[] = [];
      
      // Process baseline (catalog) quotes
      if (comparison.baseline) {
        catalogQuotes.push({
          vendor: "RSMeans Baseline",
          currency: "USD",
          unitPrice: comparison.baseline.cciAdjustedPrice / comparison.quantity,
          priceAsOf: comparison.baseline.dataAge ? 
            new Date(Date.now() - comparison.baseline.dataAge * 24 * 60 * 60 * 1000).toISOString() : 
            new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          stock: "IN_STOCK",
          parsingScore: comparison.baseline.confidence,
          vendorReliability: 0.9,
          sourceLocator: "rsmeans_baseline"
        });
      }
      
      // Process live retail quotes
      if (comparison.liveRetail && comparison.liveRetail.quotes) {
        comparison.liveRetail.quotes.forEach(quote => {
          liveQuotes.push({
            vendor: quote.supplierName,
            currency: "USD",
            unitPrice: quote.unitPrice,
            priceAsOf: quote.validUntil.toISOString(),
            fetchedAt: new Date().toISOString(),
            stock: quote.availability === "in_stock" ? "IN_STOCK" : 
                   quote.availability === "limited" ? "LIMITED" : "BACKORDER",
            location: quote.metadata?.location,
            minQty: quote.metadata?.minimumOrder,
            parsingScore: quote.confidence,
            vendorReliability: quote.metadata?.reliability ?? 0.7,
            sourceLocator: quote.supplierId
          });
        });
      }
      
      // Apply regional index if requested
      if (request.options.useRegionalIndex && request.specKey.region) {
        this.addLedgerEntry("ASSUMPTION", specKeyStable, "Regional index applied", {
          region: request.specKey.region,
          marketIndex: regionalize(1, request.specKey.region)
        });
        
        catalogQuotes.forEach(q => {
          q.unitPrice = regionalize(q.unitPrice, request.specKey.region);
        });
        liveQuotes.forEach(q => {
          q.unitPrice = regionalize(q.unitPrice, request.specKey.region);
        });
      }
      
      // Apply landed cost if requested
      if (request.options.useLanded && request.projectZip) {
        this.addLedgerEntry("ASSUMPTION", specKeyStable, "Landed cost calculation enabled", {
          projectZip: request.projectZip
        });
        
        catalogQuotes.forEach(q => {
          q.unitPrice = landedUnitPrice(q, request.qty, request.projectZip);
        });
        liveQuotes.forEach(q => {
          q.unitPrice = landedUnitPrice(q, request.qty, request.projectZip);
        });
      }
      
      // Apply currency conversion if needed
      if (request.options.fxRate && request.options.fxRate !== 1.0) {
        this.addLedgerEntry("ASSUMPTION", specKeyStable, "Currency conversion applied", {
          fxRate: request.options.fxRate,
          fromCurrency: "USD",
          toCurrency: request.options.currency
        });
        
        catalogQuotes.forEach(q => {
          q.unitPrice *= request.options.fxRate!;
        });
        liveQuotes.forEach(q => {
          q.unitPrice *= request.options.fxRate!;
        });
      }
      
      // De-duplicate quotes
      const allQuotes = [...catalogQuotes, ...liveQuotes];
      const deduplicated = this.deduplicateQuotes(allQuotes);
      
      this.addLedgerEntry("INFERENCE", specKeyStable, "Quote deduplication completed", {
        originalCount: allQuotes.length,
        deduplicatedCount: deduplicated.length,
        removedCount: allQuotes.length - deduplicated.length
      });
      
      // Select prices for each stream
      const selectorOptions: SelectorOptions = {
        maxQuoteAgeDays: request.options.maxQuoteAgeDays,
        minAccept: request.options.minAccept,
        preferVendors: request.options.preferVendors,
        requireInStock: request.options.requireInStock
      };
      
      let catalogResult: ReturnType<typeof selectPrice> | null = null;
      let liveResult: ReturnType<typeof selectPrice> | null = null;
      
      if (catalogQuotes.length > 0) {
        const catalogPrices = catalogQuotes.map(q => q.unitPrice);
        catalogResult = selectPrice(catalogPrices, catalogQuotes, selectorOptions);
        
        this.addLedgerEntry("INFERENCE", specKeyStable, "Catalog pricing selection completed", {
          quotesCount: catalogQuotes.length,
          selectedPrice: catalogResult.unitPrice,
          confidence: catalogResult.score,
          p25: catalogResult.p25,
          p75: catalogResult.p75
        });
      }
      
      if (liveQuotes.length > 0) {
        const livePrices = liveQuotes.map(q => q.unitPrice);
        liveResult = selectPrice(livePrices, liveQuotes, selectorOptions);
        
        this.addLedgerEntry("INFERENCE", specKeyStable, "Live pricing selection completed", {
          quotesCount: liveQuotes.length,
          selectedPrice: liveResult.unitPrice,
          confidence: liveResult.score,
          p25: liveResult.p25,
          p75: liveResult.p75
        });
      }
      
      // Blend or select final result
      let finalResult: PricingResult;
      let selectionBasis: "CATALOG" | "LIVE" | "BLENDED";
      
      if (catalogResult && liveResult && request.options.blendCatalogLive > 0 && request.options.blendCatalogLive < 1) {
        // Blend catalog and live
        const blendRatio = request.options.blendCatalogLive;
        const blendedPrice = blend(catalogResult.unitPrice, liveResult.unitPrice, 1 - blendRatio, blendRatio);
        const blendedScore = blend(catalogResult.score, liveResult.score, 1 - blendRatio, blendRatio);
        const blendedP25 = blend(catalogResult.p25, liveResult.p25, 1 - blendRatio, blendRatio);
        const blendedP75 = blend(catalogResult.p75, liveResult.p75, 1 - blendRatio, blendRatio);
        
        selectionBasis = "BLENDED";
        finalResult = {
          unitPrice: blendedPrice,
          score: blendedScore,
          p25: blendedP25,
          p75: blendedP75,
          quotes: [...catalogResult.used, ...liveResult.used],
          selectionBasis,
          specKeyStable,
          ledger: [...this.ledger]
        };
        
        this.addLedgerEntry("DECISION", specKeyStable, "Blended pricing selected", {
          blendRatio,
          catalogPrice: catalogResult.unitPrice,
          livePrice: liveResult.unitPrice,
          blendedPrice,
          finalScore: blendedScore
        });
      } else if (liveResult && (request.options.blendCatalogLive >= 1 || !catalogResult)) {
        // Live only
        selectionBasis = "LIVE";
        finalResult = {
          unitPrice: liveResult.unitPrice,
          score: liveResult.score,
          p25: liveResult.p25,
          p75: liveResult.p75,
          quotes: liveResult.used,
          selectionBasis,
          specKeyStable,
          ledger: [...this.ledger]
        };
        
        this.addLedgerEntry("DECISION", specKeyStable, "Live pricing selected", {
          reason: "Live quotes available and preferred",
          selectedPrice: liveResult.unitPrice,
          confidence: liveResult.score
        });
      } else if (catalogResult) {
        // Catalog only
        selectionBasis = "CATALOG";
        finalResult = {
          unitPrice: catalogResult.unitPrice,
          score: catalogResult.score,
          p25: catalogResult.p25,
          p75: catalogResult.p75,
          quotes: catalogResult.used,
          selectionBasis,
          specKeyStable,
          ledger: [...this.ledger]
        };
        
        this.addLedgerEntry("DECISION", specKeyStable, "Catalog pricing selected", {
          reason: "No live quotes or catalog preferred",
          selectedPrice: catalogResult.unitPrice,
          confidence: catalogResult.score
        });
      } else {
        throw new Error("No valid pricing data available");
      }
      
      return finalResult;
      
    } catch (error) {
      this.addLedgerEntry("DECISION", specKeyStable, "Pricing failed", {
        error: error instanceof Error ? error.message : "Unknown error"
      });
      throw error;
    }
  }
  
  private addLedgerEntry(
    type: "ASSUMPTION" | "INFERENCE" | "DECISION",
    specKeyStable: string,
    message: string,
    data?: Record<string, any>
  ) {
    const entry = createLedgerEntry(type, specKeyStable, message, data);
    this.ledger.push(entry);
  }
  
  private deduplicateQuotes(quotes: PriceQuote[]): PriceQuote[] {
    const seen = new Set<string>();
    return quotes.filter(q => {
      const key = `${q.sourceLocator}_${q.priceAsOf}_${Math.round(q.unitPrice * 100)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  private specKeyToLineItem(specKey: SpecKey, qty: Qty): TakeoffLineItem {
    return {
      itemId: toStableKey(specKey),
      material: {
        spec: `${specKey.profile || ""} ${specKey.species || ""} ${specKey.grade || ""}`.trim(),
        grade: specKey.grade || "STD",
        size: specKey.profile,
        species: specKey.species,
        treatment: specKey.coating
      },
      quantity: qty.value,
      unit: qty.uom as any, // Convert UOM to construction types
      category: specKey.mat.toLowerCase(),
      scope: `${specKey.profile || ""} ${specKey.species || ""}`.trim(),
      confidence: 0.9
    };
  }
}

export const providerRunner = new ProviderRunner();
