import { weightedMedian, selectPrice, SelectorOptions } from "../Selector";
import { regionalize, lookupMarketIdx } from "../RegionIndex";
import { landedUnitPrice } from "../Landed";
import { blend } from "../Blend";
import { PriceQuote } from "../PriceQuote";
import { Qty } from "../Uom";

describe("Pricing Core Functions", () => {
  describe("Selector", () => {
    describe("weightedMedian", () => {
      it("should calculate weighted median correctly", () => {
        const values = [1, 2, 3, 4, 5];
        const weights = [0.1, 0.2, 0.3, 0.2, 0.2];
        const result = weightedMedian(values, weights);
        expect(result).toBe(3);
      });

      it("should handle equal weights", () => {
        const values = [1, 2, 3, 4, 5];
        const weights = [0.2, 0.2, 0.2, 0.2, 0.2];
        const result = weightedMedian(values, weights);
        expect(result).toBe(3);
      });

      it("should handle single value", () => {
        const values = [42];
        const weights = [1.0];
        const result = weightedMedian(values, weights);
        expect(result).toBe(42);
      });
    });

    describe("selectPrice", () => {
      const mockQuotes: PriceQuote[] = [
        {
          vendor: "Vendor A",
          currency: "USD",
          unitPrice: 10.0,
          priceAsOf: "2025-01-01",
          fetchedAt: "2025-01-01T00:00:00Z",
          stock: "IN_STOCK",
          parsingScore: 0.9,
          vendorReliability: 0.8
        },
        {
          vendor: "Vendor B",
          currency: "USD",
          unitPrice: 12.0,
          priceAsOf: "2025-01-01",
          fetchedAt: "2025-01-01T00:00:00Z",
          stock: "IN_STOCK",
          parsingScore: 0.8,
          vendorReliability: 0.7
        },
        {
          vendor: "Vendor C",
          currency: "USD",
          unitPrice: 8.0,
          priceAsOf: "2025-01-01",
          fetchedAt: "2025-01-01T00:00:00Z",
          stock: "LIMITED",
          parsingScore: 0.7,
          vendorReliability: 0.6
        }
      ];

      const options: SelectorOptions = {
        maxQuoteAgeDays: 30,
        minAccept: 0.7,
        requireInStock: false
      };

      it("should select price with valid quotes", () => {
        const unitPrices = [10.0, 12.0, 8.0];
        const result = selectPrice(unitPrices, mockQuotes, options);
        
        expect(result.unitPrice).toBeGreaterThan(0);
        expect(result.score).toBeGreaterThan(0);
        expect(result.p25).toBeLessThan(result.p75);
        expect(result.used.length).toBeGreaterThan(0);
      });

      it("should filter out non-stock items when required", () => {
        const unitPrices = [10.0, 12.0, 8.0];
        const stockOptions = { ...options, requireInStock: true };
        const result = selectPrice(unitPrices, mockQuotes, stockOptions);
        
        // Should only include IN_STOCK items
        const stockQuotes = result.used.filter(q => q.stock === "IN_STOCK");
        expect(stockQuotes.length).toBe(result.used.length);
      });

      it("should handle empty quotes", () => {
        const result = selectPrice([], [], options);
        expect(result.unitPrice).toBeNaN();
        expect(result.score).toBe(0);
        expect(result.used.length).toBe(0);
      });
    });
  });

  describe("RegionIndex", () => {
    it("should return default index for unknown region", () => {
      const result = lookupMarketIdx("Unknown City, XX");
      expect(result).toBe(1.0);
    });

    it("should return correct index for known region", () => {
      const result = lookupMarketIdx("Seattle-Tacoma-Bellevue, WA");
      expect(result).toBe(1.00);
    });

    it("should apply regional index to prices", () => {
      const basePrice = 100.0;
      const regionalPrice = regionalize(basePrice, "San Francisco-Oakland-Berkeley, CA");
      expect(regionalPrice).toBe(108.0); // 1.08 * 100
    });
  });

  describe("Landed", () => {
    const mockQuote: PriceQuote = {
      vendor: "Test Vendor",
      currency: "USD",
      unitPrice: 10.0,
      priceAsOf: "2025-01-01",
      fetchedAt: "2025-01-01T00:00:00Z",
      minQty: 100
    };

    const mockQty: Qty = {
      value: 50,
      uom: "EA"
    };

    it("should calculate landed unit price", () => {
      const result = landedUnitPrice(mockQuote, mockQty, "12345");
      expect(result).toBeGreaterThan(0);
    });

    it("should handle minimum quantity top-up", () => {
      const result = landedUnitPrice(mockQuote, mockQty, "12345");
      // Should include top-up for minQty (100 - 50 = 50 additional units)
      expect(result).toBeGreaterThan(mockQuote.unitPrice);
    });
  });

  describe("Blend", () => {
    it("should blend two values with default weights", () => {
      const result = blend(10, 20);
      expect(result).toBe(16); // 0.4 * 10 + 0.6 * 20
    });

    it("should blend with custom weights", () => {
      const result = blend(10, 20, 0.8, 0.2);
      expect(result).toBe(12); // 0.8 * 10 + 0.2 * 20
    });

    it("should handle undefined values", () => {
      const result = blend(undefined, 20);
      expect(result).toBe(20);
    });

    it("should handle NaN values", () => {
      const result = blend(NaN, 20);
      expect(result).toBe(20);
    });
  });
});
