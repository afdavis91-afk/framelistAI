import { useState, useCallback } from "react";
import { usePricingStore } from "../state/pricingStore";
import { TakeoffLineItem } from "../types/construction";

export const usePricingRunner = (projectId: string) => {
  const [isRunning, setIsRunning] = useState(false);
  const { status, error, runPricing, clearError } = usePricingStore();
  
  const runPricingForProject = useCallback(async (lineItems: TakeoffLineItem[]) => {
    if (!lineItems || lineItems.length === 0) {
      throw new Error("No line items provided for pricing");
    }
    
    setIsRunning(true);
    try {
      // Call the real pricing logic with line items
      await runPricing(projectId, lineItems);
    } finally {
      setIsRunning(false);
    }
  }, [projectId, runPricing]);
  
  const cancelPricing = useCallback(() => {
    // TODO: Implement cancellation logic if needed
    setIsRunning(false);
  }, []);
  
  return {
    isRunning,
    status,
    error,
    runPricingForProject,
    cancelPricing,
    clearError
  };
};