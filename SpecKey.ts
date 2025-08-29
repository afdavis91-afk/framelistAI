export interface SpecKey {
  mat: "LUMBER" | "ENGINEERED_LUMBER" | "SHEATHING" | "CONNECTOR" | "FASTENER" | "MISC";
  species?: "DF" | "SPF" | "SYP" | "LVL" | "PSL" | "GLULAM";
  profile?: "2x4" | "2x6" | "2x8" | "2x10" | "2x12" | "I-JOIST" | "PLY" | "OSB" | "RIM" | "BEAM";
  grade?: "STD" | "SEL" | "STUD" | "STRUCT1";
  length_in?: number;
  thickness_in?: number;
  width_in?: number;
  span_ft?: number;
  coating?: "G90" | "ZMAX" | "SS";
  brand?: string;   // e.g., Simpson, Weyerhaeuser
  code?: string;    // e.g., LUS26, TJ560
  region?: string;  // CBSA/city-region (e.g., "Seattle-Tacoma-Bellevue, WA")
  asOf?: string;    // yyyy-mm-dd
}

export function toStableKey(k: SpecKey): string {
  const ordered = Object.keys(k).sort();
  return JSON.stringify(k, ordered).replace(/\s+/g, "");
}
