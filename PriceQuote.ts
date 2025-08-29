export interface PriceQuote {
  vendor: string;
  currency: "USD";
  unitPrice: number;      // normalized unit price (rack, pre-landed)
  priceAsOf: string;      // vendor timestamp
  fetchedAt: string;      // system timestamp
  stock?: "IN_STOCK" | "LIMITED" | "BACKORDER";
  location?: string;      // vendor location for freight calc
  minQty?: number;
  freightPolicy?: "PICKUP" | "DELIVER" | "FREE_OVER_X";
  parsingScore?: number;  // 0-1
  vendorReliability?: number; // 0-1
  freshnessDays?: number; // derived
  metadata?: Record<string, any>;
  sourceLocator?: string; // URL/API/catalog id
}
