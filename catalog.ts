import { 
  MaterialNormalization, 
  NormalizedMaterial, 
  PricingLocation, 
  Supplier, 
  WasteFactorRules,
  PricingRegion 
} from "./types";
import { UnitOfMeasure, MaterialSpec, TakeoffLineItem } from "../types/construction";

// Material normalization rules - converts various units to board feet for lumber
export const MATERIAL_NORMALIZATIONS: Record<string, MaterialNormalization[]> = {
  // Dimensional lumber (studs, plates, etc.)
  "dimensional_lumber": [
    {
      fromUnit: "EA",
      toUnit: "BF",
      conversionFactor: 0, // Calculated based on dimensions
      assumptions: ["Assumes standard dimensional lumber sizes", "Length estimated from context"]
    },
    {
      fromUnit: "LF",
      toUnit: "BF", 
      conversionFactor: 0, // Calculated based on cross-section
      assumptions: ["Cross-section dimensions inferred from spec"]
    }
  ],
  
  // Sheet goods (plywood, OSB, etc.)
  "sheet_goods": [
    {
      fromUnit: "SF",
      toUnit: "BF",
      conversionFactor: 0.75, // 3/4" standard thickness
      assumptions: ["Assumes 3/4 inch thickness unless specified"]
    },
    {
      fromUnit: "EA",
      toUnit: "SF",
      conversionFactor: 32, // 4x8 sheet = 32 SF
      assumptions: ["Assumes 4x8 sheet size unless specified"]
    }
  ],
  
  // Fasteners and hardware
  "fasteners": [
    {
      fromUnit: "EA",
      toUnit: "LBS",
      conversionFactor: 0.01, // Approximate weight per fastener
      assumptions: ["Weight estimated based on fastener type and size"]
    }
  ]
};

// Standard lumber dimensions for board foot calculations
export const LUMBER_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "2x4": { width: 1.5, height: 3.5 },
  "2x6": { width: 1.5, height: 5.5 },
  "2x8": { width: 1.5, height: 7.25 },
  "2x10": { width: 1.5, height: 9.25 },
  "2x12": { width: 1.5, height: 11.25 },
  "1x4": { width: 0.75, height: 3.5 },
  "1x6": { width: 0.75, height: 5.5 },
  "1x8": { width: 0.75, height: 7.25 },
  "1x10": { width: 0.75, height: 9.25 },
  "1x12": { width: 0.75, height: 11.25 },
  "4x4": { width: 3.5, height: 3.5 },
  "6x6": { width: 5.5, height: 5.5 }
};

// Standard lumber lengths (feet)
export const STANDARD_LENGTHS = [8, 10, 12, 14, 16, 18, 20];

// Waste factor rules by material category
export const WASTE_FACTOR_RULES: WasteFactorRules = {
  "studs": {
    defaultPct: 10,
    range: { min: 5, max: 20 },
    factors: {
      projectType: {
        "residential": 10,
        "commercial": 15,
        "industrial": 12
      },
      complexity: {
        "simple": 8,
        "moderate": 10,
        "complex": 15,
        "very_complex": 20
      },
      weather: {
        "indoor": 5,
        "covered": 8,
        "exposed": 12,
        "harsh": 15
      }
    }
  },
  "plates": {
    defaultPct: 5,
    range: { min: 3, max: 12 },
    factors: {
      projectType: {
        "residential": 5,
        "commercial": 8,
        "industrial": 7
      },
      complexity: {
        "simple": 3,
        "moderate": 5,
        "complex": 8,
        "very_complex": 12
      },
      weather: {
        "indoor": 3,
        "covered": 5,
        "exposed": 8,
        "harsh": 10
      }
    }
  },
  "sheathing": {
    defaultPct: 15,
    range: { min: 10, max: 25 },
    factors: {
      projectType: {
        "residential": 15,
        "commercial": 20,
        "industrial": 18
      },
      complexity: {
        "simple": 10,
        "moderate": 15,
        "complex": 20,
        "very_complex": 25
      },
      weather: {
        "indoor": 10,
        "covered": 12,
        "exposed": 18,
        "harsh": 22
      }
    }
  },
  "blocking": {
    defaultPct: 20,
    range: { min: 15, max: 30 },
    factors: {
      projectType: {
        "residential": 20,
        "commercial": 25,
        "industrial": 22
      },
      complexity: {
        "simple": 15,
        "moderate": 20,
        "complex": 25,
        "very_complex": 30
      },
      weather: {
        "indoor": 15,
        "covered": 18,
        "exposed": 22,
        "harsh": 25
      }
    }
  },
  "fasteners": {
    defaultPct: 25,
    range: { min: 20, max: 40 },
    factors: {
      projectType: {
        "residential": 25,
        "commercial": 30,
        "industrial": 28
      },
      complexity: {
        "simple": 20,
        "moderate": 25,
        "complex": 30,
        "very_complex": 40
      },
      weather: {
        "indoor": 20,
        "covered": 22,
        "exposed": 28,
        "harsh": 35
      }
    }
  }
};

// City Cost Index (CCI) data for major metropolitan areas
export const CITY_COST_INDEXES: Record<string, number> = {
  // High cost areas
  "San Francisco, CA": 1.45,
  "New York, NY": 1.38,
  "Los Angeles, CA": 1.25,
  "Seattle, WA": 1.22,
  "Boston, MA": 1.20,
  "Washington, DC": 1.18,
  "Chicago, IL": 1.15,
  "Denver, CO": 1.12,
  
  // Medium cost areas  
  "Atlanta, GA": 1.05,
  "Phoenix, AZ": 1.03,
  "Dallas, TX": 1.02,
  "Miami, FL": 1.08,
  "Philadelphia, PA": 1.10,
  "Minneapolis, MN": 1.07,
  "Portland, OR": 1.15,
  "Austin, TX": 1.08,
  
  // Lower cost areas
  "Kansas City, MO": 0.92,
  "Oklahoma City, OK": 0.88,
  "Memphis, TN": 0.85,
  "Birmingham, AL": 0.82,
  "Little Rock, AR": 0.80,
  "Jackson, MS": 0.78,
  "Omaha, NE": 0.90,
  "Louisville, KY": 0.87
};

// Regional supplier mapping
export const REGIONAL_SUPPLIERS: Record<PricingRegion, Supplier[]> = {
  "northeast": [
    {
      id: "home_depot_ne",
      name: "Home Depot",
      type: "big_box",
      locations: [],
      reliability: 0.9,
      averageDeliveryDays: 2,
      minimumOrder: 0
    },
    {
      id: "lowes_ne", 
      name: "Lowe's",
      type: "big_box",
      locations: [],
      reliability: 0.85,
      averageDeliveryDays: 3,
      minimumOrder: 0
    },
    {
      id: "84_lumber_ne",
      name: "84 Lumber",
      type: "lumber_yard",
      locations: [],
      reliability: 0.95,
      averageDeliveryDays: 1,
      minimumOrder: 500
    }
  ],
  "southeast": [
    {
      id: "home_depot_se",
      name: "Home Depot", 
      type: "big_box",
      locations: [],
      reliability: 0.9,
      averageDeliveryDays: 2,
      minimumOrder: 0
    },
    {
      id: "lowes_se",
      name: "Lowe's",
      type: "big_box", 
      locations: [],
      reliability: 0.85,
      averageDeliveryDays: 3,
      minimumOrder: 0
    },
    {
      id: "builders_firstsource_se",
      name: "Builders FirstSource",
      type: "lumber_yard",
      locations: [],
      reliability: 0.92,
      averageDeliveryDays: 1,
      minimumOrder: 1000
    }
  ],
  "midwest": [
    {
      id: "home_depot_mw",
      name: "Home Depot",
      type: "big_box",
      locations: [],
      reliability: 0.9,
      averageDeliveryDays: 2,
      minimumOrder: 0
    },
    {
      id: "menards_mw",
      name: "Menards",
      type: "big_box",
      locations: [],
      reliability: 0.88,
      averageDeliveryDays: 2,
      minimumOrder: 0
    },
    {
      id: "carter_lumber_mw",
      name: "Carter Lumber",
      type: "lumber_yard",
      locations: [],
      reliability: 0.90,
      averageDeliveryDays: 1,
      minimumOrder: 750
    }
  ],
  "southwest": [
    {
      id: "home_depot_sw",
      name: "Home Depot",
      type: "big_box",
      locations: [],
      reliability: 0.9,
      averageDeliveryDays: 3,
      minimumOrder: 0
    },
    {
      id: "lowes_sw",
      name: "Lowe's",
      type: "big_box",
      locations: [],
      reliability: 0.85,
      averageDeliveryDays: 3,
      minimumOrder: 0
    }
  ],
  "west": [
    {
      id: "home_depot_w",
      name: "Home Depot",
      type: "big_box",
      locations: [],
      reliability: 0.9,
      averageDeliveryDays: 2,
      minimumOrder: 0
    },
    {
      id: "lowes_w",
      name: "Lowe's", 
      type: "big_box",
      locations: [],
      reliability: 0.85,
      averageDeliveryDays: 3,
      minimumOrder: 0
    }
  ],
  "pacific": [
    {
      id: "home_depot_pac",
      name: "Home Depot",
      type: "big_box",
      locations: [],
      reliability: 0.9,
      averageDeliveryDays: 2,
      minimumOrder: 0
    },
    {
      id: "lowes_pac",
      name: "Lowe's",
      type: "big_box",
      locations: [],
      reliability: 0.85,
      averageDeliveryDays: 3,
      minimumOrder: 0
    }
  ]
};

// Material categorization helper
export function categorizeMaterial(itemId: string, materialSpec: MaterialSpec): string {
  const id = itemId.toLowerCase();
  const spec = materialSpec.spec.toLowerCase();
  
  if (id.includes("stud") || spec.includes("stud")) return "studs";
  if (id.includes("plate") || spec.includes("plate")) return "plates";
  if (id.includes("sheath") || spec.includes("sheath") || spec.includes("plywood") || spec.includes("osb")) return "sheathing";
  if (id.includes("header") || spec.includes("header") || spec.includes("beam")) return "headers";
  if (id.includes("block") || spec.includes("block")) return "blocking";
  if (id.includes("nail") || id.includes("screw") || id.includes("fastener") || spec.includes("nail")) return "fasteners";
  if (id.includes("connector") || id.includes("strap") || id.includes("anchor")) return "connectors";
  
  return "other";
}

// Normalize material quantities and units
export function normalizeMaterial(lineItem: TakeoffLineItem): NormalizedMaterial {
  const category = categorizeMaterial(lineItem.itemId, lineItem.material);
  const spec = lineItem.material.spec;
  
  // Extract dimensions from spec (e.g., "2x4", "2x6", etc.)
  const dimensionMatch = spec.match(/(\d+)x(\d+)/);
  const dimensions = dimensionMatch ? `${dimensionMatch[1]}x${dimensionMatch[2]}` : null;
  
  // Guard against invalid quantities
  const safeQuantity = Number.isFinite(lineItem.qty) && lineItem.qty > 0 ? lineItem.qty : 0;
  
  let normalizedQuantity = safeQuantity;
  let normalizedUnit: UnitOfMeasure = lineItem.uom;
  let conversionFactor = 1;
  let assumptions: string[] = [];
  
  // Add NaN protection warning if quantity was invalid
  if (!Number.isFinite(lineItem.qty) || lineItem.qty <= 0) {
    assumptions.push(`Invalid quantity (${lineItem.qty}) replaced with 0`);
  }
  
  // Convert to board feet for lumber
  if (category === "studs" || category === "plates" || category === "headers") {
    if (lineItem.uom === "EA" && dimensions && LUMBER_DIMENSIONS[dimensions]) {
      // Estimate length based on context or use standard 8ft
      const estimatedLength = estimateLength(lineItem, category);
      const dims = LUMBER_DIMENSIONS[dimensions];
      
      // Board feet = (width * height * length) / 144
      const boardFeetPerPiece = (dims.width * dims.height * estimatedLength) / 144;
      
      // Guard against NaN in calculations
      if (Number.isFinite(boardFeetPerPiece) && boardFeetPerPiece > 0) {
        normalizedQuantity = safeQuantity * boardFeetPerPiece;
        normalizedUnit = "BF";
        conversionFactor = boardFeetPerPiece;
        assumptions.push(`Estimated ${estimatedLength}ft length for ${dimensions} lumber`);
        assumptions.push(`Converted using actual dimensions: ${dims.width}" x ${dims.height}"`);
      } else {
        assumptions.push("Invalid board feet calculation, using original quantity");
      }
    } else if (lineItem.uom === "LF" && dimensions && LUMBER_DIMENSIONS[dimensions]) {
      const dims = LUMBER_DIMENSIONS[dimensions];
      const boardFeetPerFoot = (dims.width * dims.height) / 144;
      
      if (Number.isFinite(boardFeetPerFoot) && boardFeetPerFoot > 0) {
        normalizedQuantity = safeQuantity * boardFeetPerFoot;
        normalizedUnit = "BF";
        conversionFactor = boardFeetPerFoot;
        assumptions.push(`Converted linear feet to board feet using ${dimensions} dimensions`);
      } else {
        assumptions.push("Invalid board feet conversion, using original quantity");
      }
    }
  }
  
  // Convert sheet goods to board feet
  else if (category === "sheathing") {
    if (lineItem.uom === "SF") {
      // Assume 3/4" thickness unless specified
      const thickness = extractThickness(spec) || 0.75;
      const conversionRate = thickness / 12;
      
      if (Number.isFinite(conversionRate) && conversionRate > 0) {
        normalizedQuantity = safeQuantity * conversionRate; // Convert to board feet
        normalizedUnit = "BF";
        conversionFactor = conversionRate;
        assumptions.push(`Assumed ${thickness}" thickness for sheet goods`);
      } else {
        assumptions.push("Invalid thickness conversion, using original quantity");
      }
    } else if (lineItem.uom === "EA") {
      // Assume 4x8 sheets
      const sheetSF = 32;
      const thickness = extractThickness(spec) || 0.75;
      const conversionRate = sheetSF * (thickness / 12);
      
      if (Number.isFinite(conversionRate) && conversionRate > 0) {
        normalizedQuantity = safeQuantity * conversionRate;
        normalizedUnit = "BF";
        conversionFactor = conversionRate;
        assumptions.push("Assumed 4x8 sheet size");
        assumptions.push(`Assumed ${thickness}" thickness`);
      } else {
        assumptions.push("Invalid sheet conversion, using original quantity");
      }
    }
  }
  
  // Convert fasteners to pounds
  else if (category === "fasteners") {
    if (lineItem.uom === "EA") {
      const weightPerFastener = estimateFastenerWeight(spec);
      
      if (Number.isFinite(weightPerFastener) && weightPerFastener > 0) {
        normalizedQuantity = safeQuantity * weightPerFastener;
        normalizedUnit = "LBS";
        conversionFactor = weightPerFastener;
        assumptions.push(`Estimated ${weightPerFastener} lbs per fastener based on type`);
      } else {
        assumptions.push("Invalid fastener weight, using original quantity");
      }
    }
  }
  
  // Final safety check on normalized quantity
  if (!Number.isFinite(normalizedQuantity)) {
    normalizedQuantity = 0;
    assumptions.push("Final quantity check failed, set to 0");
  }
  
  return {
    originalSpec: spec,
    normalizedSpec: spec,
    originalQuantity: lineItem.qty,
    normalizedQuantity,
    originalUnit: lineItem.uom,
    normalizedUnit,
    conversionFactor,
    assumptions
  };
}

// Helper functions
function estimateLength(lineItem: TakeoffLineItem, category: string): number {
  // Try to extract length from context or spec
  const context = lineItem.context.scope.toLowerCase();
  const spec = lineItem.material.spec.toLowerCase();
  
  // Look for length indicators in spec or context
  const lengthMatch = spec.match(/(\d+)['"]?\s*(?:ft|foot|feet)/i) || 
                     context.match(/(\d+)['"]?\s*(?:ft|foot|feet)/i);
  
  if (lengthMatch) {
    const length = parseInt(lengthMatch[1]);
    if (Number.isFinite(length) && length > 0) {
      return length;
    }
  }
  
  // Default lengths by category
  switch (category) {
    case "studs": return 8; // Standard wall height
    case "plates": return 12; // Typical plate length
    case "headers": return 10; // Average header span
    default: return 8;
  }
}

function extractThickness(spec: string): number | null {
  // Look for thickness indicators like "3/4", "1/2", "5/8", etc.
  const fractionMatch = spec.match(/(\d+)\/(\d+)["']?\s*(?:in|inch)?/i);
  if (fractionMatch) {
    const numerator = parseInt(fractionMatch[1]);
    const denominator = parseInt(fractionMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }
  
  const decimalMatch = spec.match(/(\d+\.?\d*)["']?\s*(?:in|inch)?/i);
  if (decimalMatch) {
    const thickness = parseFloat(decimalMatch[1]);
    if (Number.isFinite(thickness) && thickness > 0) {
      return thickness;
    }
  }
  
  return null;
}

function estimateFastenerWeight(spec: string): number {
  const specLower = spec.toLowerCase();
  
  let weight = 0.005; // Default weight
  
  // Common fastener weights (pounds per piece)
  if (specLower.includes("16d") || specLower.includes("3.5")) weight = 0.01;
  else if (specLower.includes("10d") || specLower.includes("3")) weight = 0.008;
  else if (specLower.includes("8d") || specLower.includes("2.5")) weight = 0.006;
  else if (specLower.includes("6d") || specLower.includes("2")) weight = 0.004;
  else if (specLower.includes("screw")) weight = 0.005;
  else if (specLower.includes("bolt")) weight = 0.1;
  
  // Ensure weight is valid
  return Number.isFinite(weight) && weight > 0 ? weight : 0.005;
}

// Get suppliers for a location
export function getSuppliersForLocation(location: PricingLocation): Supplier[] {
  return REGIONAL_SUPPLIERS[location.region] || [];
}

// Get waste factor for material category
export function getWasteFactor(
  category: string, 
  projectType: string = "residential",
  complexity: string = "moderate",
  weather: string = "indoor"
): number {
  const rules = WASTE_FACTOR_RULES[category];
  if (!rules) return 10; // Default 10%
  
  let factor = rules.defaultPct;
  
  // Apply project type factor
  if (rules.factors.projectType[projectType]) {
    factor = rules.factors.projectType[projectType];
  }
  
  // Apply complexity adjustment
  if (rules.factors.complexity[complexity]) {
    const complexityFactor = rules.factors.complexity[complexity];
    factor = (factor + complexityFactor) / 2; // Average with base
  }
  
  // Apply weather adjustment  
  if (rules.factors.weather[weather]) {
    const weatherFactor = rules.factors.weather[weather];
    factor = (factor + weatherFactor) / 2; // Average with base
  }
  
  // Ensure within range
  return Math.max(rules.range.min, Math.min(rules.range.max, factor));
}

// Get cost index for location
export function getCostIndex(city: string, state: string): number {
  const locationKey = `${city}, ${state}`;
  return CITY_COST_INDEXES[locationKey] || 1.0; // Default to national average
}

// Determine region from state
export function getRegionFromState(state: string): PricingRegion {
  const stateRegionMap: Record<string, PricingRegion> = {
    // Northeast
    "ME": "northeast", "NH": "northeast", "VT": "northeast", "MA": "northeast",
    "RI": "northeast", "CT": "northeast", "NY": "northeast", "NJ": "northeast", "PA": "northeast",
    
    // Southeast  
    "DE": "southeast", "MD": "southeast", "DC": "southeast", "VA": "southeast", "WV": "southeast",
    "KY": "southeast", "TN": "southeast", "NC": "southeast", "SC": "southeast", "GA": "southeast",
    "FL": "southeast", "AL": "southeast", "MS": "southeast", "AR": "southeast", "LA": "southeast",
    
    // Midwest
    "OH": "midwest", "MI": "midwest", "IN": "midwest", "WI": "midwest", "IL": "midwest",
    "MN": "midwest", "IA": "midwest", "MO": "midwest", "ND": "midwest", "SD": "midwest", "NE": "midwest", "KS": "midwest",
    
    // Southwest
    "OK": "southwest", "TX": "southwest", "NM": "southwest", "AZ": "southwest",
    
    // West
    "CO": "west", "WY": "west", "MT": "west", "ID": "west", "UT": "west", "NV": "west",
    
    // Pacific
    "WA": "pacific", "OR": "pacific", "CA": "pacific", "AK": "pacific", "HI": "pacific"
  };
  
  return stateRegionMap[state.toUpperCase()] || "midwest";
}