import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { providerRunner, PricingRequest, PricingResult as NewPricingResult } from "../pricing/ProviderRunner";
import { SpecKey, toStableKey } from "../pricing/SpecKey";
import { Qty } from "../pricing/Uom";
import { TakeoffLineItem } from "../types/construction";
import { MaterialSpecNormalizer } from "../pricing/MaterialSpecNormalizer";

export type CostOptions = {
  // Core pricing options
  useRegionalIndex: boolean;
  useLanded: boolean;
  blendCatalogLive: number; // 0..1
  requireInStock: boolean;
  maxQuoteAgeDays: number;
  minAccept: number;
  
  // Legacy options (kept for backward compatibility)
  priceAsOf?: string;
  maxConcurrent: number;
  retries: number;
  timeoutMs: number;
  vendorPrefs?: string[];
  currency: "USD" | string;
  fxRate?: number;
};

export type PricingStatus = "idle" | "running" | "success" | "error";

export type PricingResult = {
  projectId: string;
  asOfISO: string;
  lines: Array<{
    materialId: string;
    unitPrice: number;
    vendor: string;
    priceAsOfUsed: string;
    currency: string;
    score: number;
    // New robust pricing fields
    p25?: number;
    p75?: number;
    selectionBasis?: "CATALOG" | "LIVE" | "BLENDED";
    specKeyStable?: string;
    quotes?: Array<{
      vendor: string;
      unitPrice: number;
      stock?: string;
      priceAsOf: string;
      weight: number;
    }>;
  }>;
  providerMeta?: Record<string, unknown>;
  // New robust pricing metadata
  ledger?: Array<{
    id: string;
    timestamp: string;
    type: "ASSUMPTION" | "INFERENCE" | "DECISION";
    message: string;
    data?: Record<string, any>;
  }>;
};

interface PricingStore {
  // State
  options: CostOptions;
  status: PricingStatus;
  error?: string;
  lastResultByProject: Record<string, PricingResult>;
  
  // Actions
  setOptions: (p: Partial<CostOptions>) => void;
  runPricing: (projectId: string, lineItems: TakeoffLineItem[]) => Promise<void>;
  clearError: () => void;
  setPricingResult: (projectId: string, result: PricingResult) => void;
}

// Enhanced backend defaults with new robust pricing options
const defaultOptions: CostOptions = {
  // New robust pricing options
  useRegionalIndex: true,        // Apply regional market indices
  useLanded: false,              // Calculate landed costs (delivery + tax)
  blendCatalogLive: 0.6,         // 60% live, 40% catalog blend
  requireInStock: false,         // Allow backorder items
  maxQuoteAgeDays: 30,           // Maximum age of quotes to consider
  minAccept: 0.85,               // Minimum confidence threshold
  
  // Legacy options
  maxConcurrent: 8,              // Backend default: 8 concurrent requests
  retries: 2,                    // Backend default: 2 retries
  timeoutMs: 45000,              // Backend default: 45 second timeout
  currency: "USD",               // Backend default: USD
  vendorPrefs: ["preferred"],    // Backend default: preferred vendors
  fxRate: 1.0                    // Backend default: no FX conversion
};

export const usePricingStore = create<PricingStore>()(
  persist(
    (set, get) => ({
      options: defaultOptions,
      status: "idle",
      error: undefined,
      lastResultByProject: {},
      
      setOptions: (newOptions) =>
        set((state) => ({
          options: { ...state.options, ...newOptions }
        })),
      
      runPricing: async (projectId: string, lineItems: TakeoffLineItem[]) => {
        set({ status: "running", error: undefined });
        
        try {
          const options = get().options;
          const results: PricingResult["lines"] = [];
          const allLedgerEntries: PricingResult["ledger"] = [];
          
          // Process each line item with the new robust pricing system
          for (const lineItem of lineItems) {
            try {
              // Convert TakeoffLineItem to SpecKey and Qty
              const specKey = lineItemToSpecKey(lineItem);
                             const qty: Qty = {
                 value: lineItem.qty,
                 uom: lineItem.uom as any,
                 packSize: 1 // Default pack size
               };
              
              // Create pricing request
              const request: PricingRequest = {
                specKey,
                qty,
                options: {
                  useRegionalIndex: options.useRegionalIndex,
                  useLanded: options.useLanded,
                  blendCatalogLive: options.blendCatalogLive,
                  requireInStock: options.requireInStock,
                  maxQuoteAgeDays: options.maxQuoteAgeDays,
                  minAccept: options.minAccept,
                  priceAsOf: options.priceAsOf,
                  currency: options.currency as "USD",
                  fxRate: options.fxRate,
                  preferVendors: options.vendorPrefs
                },
                projectZip: undefined // TODO: Get from project location
              };
              
              // Get pricing using new provider runner
              const pricingResult = await providerRunner.getBestQuotes(request);
              
              // Convert to our result format
              results.push({
                materialId: lineItem.itemId,
                unitPrice: pricingResult.unitPrice,
                vendor: pricingResult.quotes[0]?.vendor || "Unknown",
                priceAsOfUsed: pricingResult.quotes[0]?.priceAsOf || new Date().toISOString(),
                currency: "USD",
                score: pricingResult.score,
                // New robust pricing fields
                p25: pricingResult.p25,
                p75: pricingResult.p75,
                selectionBasis: pricingResult.selectionBasis,
                specKeyStable: pricingResult.specKeyStable,
                quotes: pricingResult.quotes.map(q => ({
                  vendor: q.vendor,
                  unitPrice: q.unitPrice,
                  stock: q.stock,
                  priceAsOf: q.priceAsOf,
                  weight: q.parsingScore || 0.7
                }))
              });
              
              // Collect ledger entries
              if (pricingResult.ledger) {
                allLedgerEntries.push(...pricingResult.ledger);
              }
              
            } catch (error) {
              console.warn(`Failed to price line item ${lineItem.itemId}:`, error);
              // Add fallback pricing for failed items
              results.push({
                materialId: lineItem.itemId,
                unitPrice: 0,
                vendor: "Pricing Failed",
                priceAsOfUsed: new Date().toISOString(),
                currency: "USD",
                score: 0,
                p25: 0,
                p75: 0,
                selectionBasis: "CATALOG",
                specKeyStable: "",
                quotes: []
              });
            }
          }
          
          if (results.length === 0) {
            throw new Error("No pricing data could be retrieved for any line items");
          }
          
          // Create final result
          const pricingResult: PricingResult = {
            projectId,
            asOfISO: new Date().toISOString(),
            lines: results,
            providerMeta: {
              totalItems: results.length,
              successfulItems: results.filter(r => r.score > 0).length,
              failedItems: results.filter(r => r.score === 0).length,
              averageConfidence: results.reduce((sum, r) => sum + r.score, 0) / results.length,
              options: options,
              timestamp: new Date().toISOString()
            },
            ledger: allLedgerEntries
          };
          
          // Store the result
          set((state) => ({
            status: "success",
            lastResultByProject: {
              ...state.lastResultByProject,
              [projectId]: pricingResult
            }
          }));
          
        } catch (error) {
          console.error("Pricing failed:", error);
          set({ 
            status: "error", 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      },
      
      clearError: () => set({ error: undefined }),
      
      setPricingResult: (projectId: string, result: PricingResult) =>
        set((state) => ({
          lastResultByProject: {
            ...state.lastResultByProject,
            [projectId]: result
          }
        }))
    }),
    {
      name: "pricing-store",
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);

  // Helper function to convert TakeoffLineItem to SpecKey
  function lineItemToSpecKey(lineItem: TakeoffLineItem): SpecKey {
    // First, normalize the material spec to get better parsing
    const normalizedSpec = MaterialSpecNormalizer.normalizeSpec(lineItem.material.spec);
    
    // Log the normalization for debugging
    console.log(`Normalizing material spec: "${lineItem.material.spec}" -> "${normalizedSpec.normalizedSpec}" (confidence: ${normalizedSpec.confidence})`);
    
    // Use the normalized spec for better parsing
    const spec = normalizedSpec.normalizedSpec.toLowerCase();
    const originalSpec = lineItem.material.spec.toLowerCase();
    
    // Determine material type based on normalized category
    let mat: SpecKey["mat"] = "MISC";
    switch (normalizedSpec.category) {
      case "lumber":
        mat = "LUMBER";
        break;
      case "sheathing":
        mat = "SHEATHING";
        break;
      case "fastener":
        mat = "FASTENER";
        break;
      case "connector":
        mat = "CONNECTOR";
        break;
      case "engineered_lumber":
        mat = "ENGINEERED_LUMBER";
        break;
      default:
        // Fallback to original logic for edge cases
        if (originalSpec.includes("2x") || originalSpec.includes("stud") || originalSpec.includes("plate")) {
          mat = "LUMBER";
        } else if (originalSpec.includes("ply") || originalSpec.includes("osb") || originalSpec.includes("sheathing")) {
          mat = "SHEATHING";
        } else if (originalSpec.includes("nail") || originalSpec.includes("screw") || originalSpec.includes("fastener")) {
          mat = "FASTENER";
        } else if (originalSpec.includes("joist") || originalSpec.includes("beam") || originalSpec.includes("lvl")) {
          mat = "ENGINEERED_LUMBER";
        } else if (originalSpec.includes("connector") || originalSpec.includes("bracket")) {
          mat = "CONNECTOR";
        }
    }
    
    // Use normalized species if available, otherwise fallback to original logic
    let species: SpecKey["species"] | undefined = normalizedSpec.species as SpecKey["species"];
    if (!species) {
      if (originalSpec.includes("spf")) species = "SPF";
      else if (originalSpec.includes("df") || originalSpec.includes("douglas")) species = "DF";
      else if (originalSpec.includes("syp") || originalSpec.includes("southern")) species = "SYP";
      else if (originalSpec.includes("lvl")) species = "LVL";
      else if (originalSpec.includes("psl")) species = "PSL";
      else if (originalSpec.includes("glulam")) species = "GLULAM";
    }
    
    // Use normalized dimensions for profile, otherwise fallback to original logic
    let profile: SpecKey["profile"] | undefined;
    if (normalizedSpec.dimensions.width && normalizedSpec.dimensions.height) {
      const profileString = `${normalizedSpec.dimensions.width}x${normalizedSpec.dimensions.height}`;
      // Only assign if it matches a valid profile type
      if (["2x4", "2x6", "2x8", "2x10", "2x12"].includes(profileString)) {
        profile = profileString as SpecKey["profile"];
      }
    }
    
    if (!profile) {
      // Fallback to original logic
      if (originalSpec.includes("2x4")) profile = "2x4";
      else if (originalSpec.includes("2x6")) profile = "2x6";
      else if (originalSpec.includes("2x8")) profile = "2x8";
      else if (originalSpec.includes("2x10")) profile = "2x10";
      else if (originalSpec.includes("2x12")) profile = "2x12";
      else if (originalSpec.includes("i-joist")) profile = "I-JOIST";
      else if (originalSpec.includes("ply")) profile = "PLY";
      else if (originalSpec.includes("osb")) profile = "OSB";
    }
    
    // Use normalized grade if available, otherwise fallback to original logic
    let grade: SpecKey["grade"] | undefined = normalizedSpec.grade as SpecKey["grade"];
    if (!grade) {
      if (originalSpec.includes("stud")) grade = "STUD";
      else if (originalSpec.includes("sel") || originalSpec.includes("select")) grade = "SEL";
      else if (originalSpec.includes("struct") || originalSpec.includes("structural")) grade = "STRUCT1";
      else grade = "STD";
    }
    
    // Extract dimensions from normalized spec or fallback to original logic
    let length_in: number | undefined;
    if (normalizedSpec.dimensions.length) {
      length_in = normalizedSpec.dimensions.length * 12; // Convert feet to inches
    } else {
      const lengthMatch = originalSpec.match(/(\d+)ft|(\d+)'|(\d+)"/);
      length_in = lengthMatch ? parseInt(lengthMatch[1] || lengthMatch[2] || lengthMatch[3]) * 12 : undefined;
    }
    
    // Extract additional dimensions if available
    let thickness_in: number | undefined;
    let width_in: number | undefined;
    
    if (normalizedSpec.dimensions.thickness) {
      thickness_in = normalizedSpec.dimensions.thickness;
    }
    if (normalizedSpec.dimensions.width) {
      width_in = normalizedSpec.dimensions.width;
    }
    
    return {
      mat,
      species,
      profile,
      grade,
      length_in,
      thickness_in,
      width_in,
      region: "Denver-Aurora-Lakewood, CO" // Default region, should come from project
    };
  }