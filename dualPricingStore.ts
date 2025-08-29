import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createRobustJSONStorage, validatePricingPreferences } from "../utils/storageUtils";
import { 
  PricingComparison, 
  PricingPreferences, 
  BatchPricingResult,
  PricingLocation 
} from "../pricing/types";

interface DualPricingState {
  // Preferences
  preferences: PricingPreferences;
  
  // Pricing comparisons by takeoff ID
  comparisons: Record<string, PricingComparison[]>;
  
  // Batch pricing results
  batchResults: Record<string, BatchPricingResult>;
  
  // UI state
  selectedComparison: PricingComparison | null;
  showPricingModal: boolean;
  pricingViewMode: "comparison" | "live_only" | "baseline_only";
  
  // Actions
  setPreferences: (preferences: Partial<PricingPreferences>) => void;
  setLocation: (location: PricingLocation) => void;
  
  // Comparison management
  setComparisons: (takeoffId: string, comparisons: PricingComparison[]) => void;
  addComparison: (takeoffId: string, comparison: PricingComparison) => void;
  getComparisons: (takeoffId: string) => PricingComparison[];
  clearComparisons: (takeoffId: string) => void;
  
  // Batch results
  setBatchResult: (requestId: string, result: BatchPricingResult) => void;
  getBatchResult: (requestId: string) => BatchPricingResult | null;
  clearBatchResult: (requestId: string) => void;
  
  // UI actions
  setSelectedComparison: (comparison: PricingComparison | null) => void;
  setShowPricingModal: (show: boolean) => void;
  setPricingViewMode: (mode: "comparison" | "live_only" | "baseline_only") => void;
  
  // Utility actions
  clearAllData: () => void;
  getComparisonSummary: (takeoffId: string) => {
    totalItems: number;
    averageSavings: number;
    recommendedTotal: number;
    liveRetailTotal: number;
    baselineTotal: number;
  };
}

const defaultPreferences: PricingPreferences = {
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
};

export const useDualPricingStore = create<DualPricingState>()(
  persist(
    (set, get) => ({
      // Initial state
      preferences: defaultPreferences,
      comparisons: {},
      batchResults: {},
      selectedComparison: null,
      showPricingModal: false,
      pricingViewMode: "comparison",
      
      // Preference actions
      setPreferences: (newPreferences) => 
        set((state) => ({
          preferences: { ...state.preferences, ...newPreferences }
        })),
      
      setLocation: (location) =>
        set((state) => ({
          preferences: { ...state.preferences, defaultLocation: location }
        })),
      
      // Comparison management
      setComparisons: (takeoffId, comparisons) =>
        set((state) => ({
          comparisons: { ...state.comparisons, [takeoffId]: comparisons }
        })),
      
      addComparison: (takeoffId, comparison) =>
        set((state) => {
          const existing = state.comparisons[takeoffId] || [];
          const updated = [...existing.filter(c => c.lineItemId !== comparison.lineItemId), comparison];
          return {
            comparisons: { ...state.comparisons, [takeoffId]: updated }
          };
        }),
      
      getComparisons: (takeoffId) => {
        const state = get();
        return state.comparisons[takeoffId] || [];
      },
      
      clearComparisons: (takeoffId) =>
        set((state) => {
          const { [takeoffId]: removed, ...rest } = state.comparisons;
          return { comparisons: rest };
        }),
      
      // Batch results
      setBatchResult: (requestId, result) =>
        set((state) => ({
          batchResults: { ...state.batchResults, [requestId]: result }
        })),
      
      getBatchResult: (requestId) => {
        const state = get();
        return state.batchResults[requestId] || null;
      },
      
      clearBatchResult: (requestId) =>
        set((state) => {
          const { [requestId]: removed, ...rest } = state.batchResults;
          return { batchResults: rest };
        }),
      
      // UI actions
      setSelectedComparison: (comparison) =>
        set({ selectedComparison: comparison }),
      
      setShowPricingModal: (show) =>
        set({ showPricingModal: show }),
      
      setPricingViewMode: (mode) =>
        set({ pricingViewMode: mode }),
      
      // Utility actions
      clearAllData: () =>
        set({
          comparisons: {},
          batchResults: {},
          selectedComparison: null,
          showPricingModal: false
        }),
      
      getComparisonSummary: (takeoffId) => {
        const state = get();
        const comparisons = state.comparisons[takeoffId] || [];
        
        if (comparisons.length === 0) {
          return {
            totalItems: 0,
            averageSavings: 0,
            recommendedTotal: 0,
            liveRetailTotal: 0,
            baselineTotal: 0
          };
        }
        
        let liveRetailTotal = 0;
        let baselineTotal = 0;
        let recommendedTotal = 0;
        
        comparisons.forEach(comparison => {
          liveRetailTotal += comparison.liveRetail.bestQuote.totalPrice;
          baselineTotal += comparison.baseline.cciAdjustedPrice;
          
          const recommendedPrice = comparison.recommendation.preferredOption === "live_retail"
            ? comparison.liveRetail.bestQuote.totalPrice
            : comparison.baseline.cciAdjustedPrice;
          recommendedTotal += recommendedPrice;
        });
        
        const averageSavings = baselineTotal > 0 
          ? ((baselineTotal - recommendedTotal) / baselineTotal) * 100
          : 0;
        
        return {
          totalItems: comparisons.length,
          averageSavings,
          recommendedTotal,
          liveRetailTotal,
          baselineTotal
        };
      }
    }),
    {
      name: "dual-pricing-storage",
      storage: createJSONStorage(() => createRobustJSONStorage({
        validateState: validatePricingPreferences,
        onError: (error, key) => {
          console.warn(`[DualPricingStore] Storage error for ${key}:`, error.message);
        }
      })),
      partialize: (state) => ({
        preferences: state.preferences,
        comparisons: state.comparisons,
        // Don't persist UI state or batch results (they're temporary)
      }),
    }
  )
);

// Selectors for better performance
export const usePricingPreferences = () => 
  useDualPricingStore((state) => state.preferences);

export const usePricingComparisons = (takeoffId: string) =>
  useDualPricingStore((state) => state.comparisons[takeoffId] || []);

export const usePricingViewMode = () =>
  useDualPricingStore((state) => state.pricingViewMode);

export const useSelectedComparison = () =>
  useDualPricingStore((state) => state.selectedComparison);

export const usePricingModal = () =>
  useDualPricingStore((state) => ({
    showPricingModal: state.showPricingModal,
    setShowPricingModal: state.setShowPricingModal
  }));

export const useComparisonSummary = (takeoffId: string) =>
  useDualPricingStore((state) => state.getComparisonSummary(takeoffId));