import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRobustJSONStorage, validatePricingPreferences, validateConstructionState } from "../utils/storageUtils";

// Mock AsyncStorage for testing
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiRemove: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe("Storage Error Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear console warnings for clean test output
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("createRobustJSONStorage", () => {
    it("should handle truncated JSON gracefully", async () => {
      const storage = createRobustJSONStorage();
      
      // Simulate truncated JSON (missing closing brace)
      mockAsyncStorage.getItem.mockResolvedValue('{"preferences":{"defaultLocation":{"city":"Denver"');
      
      const result = await storage.getItem("test-key");
      
      expect(result).toBeNull();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith("test-key");
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("[StorageUtils] Failed to parse stored data for test-key")
      );
    });

    it("should handle completely invalid JSON", async () => {
      const storage = createRobustJSONStorage();
      
      // Simulate invalid JSON
      mockAsyncStorage.getItem.mockResolvedValue("not-json-at-all");
      
      const result = await storage.getItem("test-key");
      
      expect(result).toBeNull();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith("test-key");
    });

    it("should handle empty/null storage gracefully", async () => {
      const storage = createRobustJSONStorage();
      
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const result = await storage.getItem("test-key");
      
      expect(result).toBeNull();
      expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
    });

    it("should validate state when validator is provided", async () => {
      const mockValidator = jest.fn().mockReturnValue(false);
      const storage = createRobustJSONStorage({ validateState: mockValidator });
      
      mockAsyncStorage.getItem.mockResolvedValue('{"valid": "json"}');
      
      const result = await storage.getItem("test-key");
      
      expect(mockValidator).toHaveBeenCalledWith({ valid: "json" });
      expect(result).toBeNull();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith("test-key");
    });

    it("should call error handler when provided", async () => {
      const mockErrorHandler = jest.fn();
      const storage = createRobustJSONStorage({ onError: mockErrorHandler });
      
      mockAsyncStorage.getItem.mockResolvedValue("invalid-json");
      
      await storage.getItem("test-key");
      
      expect(mockErrorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        "test-key"
      );
    });

    it("should handle setItem errors gracefully", async () => {
      const storage = createRobustJSONStorage();
      
      mockAsyncStorage.setItem.mockRejectedValue(new Error("Storage full"));
      
      // Should not throw
      await expect(storage.setItem("test-key", "test-value")).resolves.toBeUndefined();
      
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("[StorageUtils] Failed to save data for test-key")
      );
    });
  });

  describe("validatePricingPreferences", () => {
    it("should validate correct pricing preferences structure", () => {
      const validState = {
        preferences: {
          defaultLocation: {
            city: "Denver",
            state: "CO",
            costIndex: 1.12,
            region: "west"
          },
          preferredSuppliers: [],
          maxPriceAge: 24,
          confidenceThreshold: 0.7,
          enableLiveRetail: true,
          enableBaseline: true,
          wasteFactorOverrides: {},
          budgetBuffer: 10
        }
      };

      expect(validatePricingPreferences(validState)).toBe(true);
    });

    it("should reject invalid pricing preferences structure", () => {
      const invalidStates = [
        null,
        {},
        { preferences: null },
        { preferences: { defaultLocation: null } },
        { preferences: { defaultLocation: { city: "Denver" } } }, // missing required fields
        { preferences: { defaultLocation: { city: "Denver", state: "CO", costIndex: "invalid" } } },
      ];

      invalidStates.forEach(state => {
        expect(validatePricingPreferences(state)).toBe(false);
      });
    });
  });

  describe("validateConstructionState", () => {
    it("should validate correct construction state structure", () => {
      const validState = {
        projects: [
          {
            id: "project-1",
            name: "Test Project",
            address: "123 Main St",
            levels: [],
            documents: [],
            takeoffs: []
          }
        ],
        constructionStandards: {
          studSpacingDefault: 16,
          cornerStudCount: 3,
          tIntersectionStudCount: 2,
          headerBearing: 1.5,
          wasteFactors: {
            studsPct: 10,
            platesPct: 5
          }
        }
      };

      expect(validateConstructionState(validState)).toBe(true);
    });

    it("should reject invalid construction state structure", () => {
      const invalidStates = [
        null,
        {},
        { projects: null },
        { projects: "not-array" },
        { projects: [{ id: null }] }, // invalid project
        { projects: [], constructionStandards: null },
      ];

      invalidStates.forEach(state => {
        expect(validateConstructionState(state)).toBe(false);
      });
    });
  });

  describe("Real-world corruption scenarios", () => {
    it("should handle dual-pricing-storage corruption", async () => {
      const storage = createRobustJSONStorage({ 
        validateState: validatePricingPreferences 
      });
      
      // Simulate real corruption: truncated during manual edit
      mockAsyncStorage.getItem.mockResolvedValue(
        '{"preferences":{"defaultLocation":{"city":"Denver","state":"CO","costIndex":1.12'
      );
      
      const result = await storage.getItem("dual-pricing-storage");
      
      expect(result).toBeNull();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith("dual-pricing-storage");
    });

    it("should handle construction-storage corruption", async () => {
      const storage = createRobustJSONStorage({ 
        validateState: validateConstructionState 
      });
      
      // Simulate corruption: missing closing brackets
      mockAsyncStorage.getItem.mockResolvedValue(
        '{"projects":[{"id":"proj1","name":"Test"'
      );
      
      const result = await storage.getItem("construction-storage");
      
      expect(result).toBeNull();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith("construction-storage");
    });
  });
});