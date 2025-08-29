import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createRobustJSONStorage } from "../utils/storageUtils";

 interface SettingsState {
   enableDrawingAnalysis: boolean;
   enableVisionAnalysis: boolean;
   enableAutoDecisions: boolean;
   decisionMinConfidence: number; // 0-1
   setEnableDrawingAnalysis: (value: boolean) => void;
   setEnableVisionAnalysis: (value: boolean) => void;
   setEnableAutoDecisions: (value: boolean) => void;
   setDecisionMinConfidence: (value: number) => void;
 }
 
 export const useSettingsStore = create<SettingsState>()(
   persist(
     (set) => ({
       enableDrawingAnalysis: true,
       enableVisionAnalysis: true,
       enableAutoDecisions: true,
       decisionMinConfidence: 0.75,
       setEnableDrawingAnalysis: (value) => set({ enableDrawingAnalysis: value }),
       setEnableVisionAnalysis: (value) => set({ enableVisionAnalysis: value }),
       setEnableAutoDecisions: (value) => set({ enableAutoDecisions: value }),
       setDecisionMinConfidence: (value) => set({ decisionMinConfidence: Math.max(0, Math.min(1, value)) }),
     }),
     {
       name: "settings-storage",
       storage: createJSONStorage(() =>
         createRobustJSONStorage({
           validateState: (state) => {
             if (typeof state !== "object" || state === null) return false;
             const s = state as Partial<SettingsState>;
             return typeof s.enableDrawingAnalysis === "boolean" && 
                    typeof s.enableVisionAnalysis === "boolean" &&
                    typeof s.enableAutoDecisions === "boolean" &&
                    typeof s.decisionMinConfidence === "number" &&
                    s.decisionMinConfidence >= 0 && s.decisionMinConfidence <= 1;
           },
           onError: (error, key) => {
             console.warn(`[SettingsStore] Storage error for ${key}:`, error.message);
           },
         })
       ),
       partialize: (state) => ({
         enableDrawingAnalysis: state.enableDrawingAnalysis,
         enableVisionAnalysis: state.enableVisionAnalysis,
         enableAutoDecisions: state.enableAutoDecisions,
         decisionMinConfidence: state.decisionMinConfidence,
       }),
     }
   )
 );

