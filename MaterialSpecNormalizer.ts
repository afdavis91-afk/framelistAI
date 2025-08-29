export interface NormalizedMaterialSpec {
  normalizedSpec: string;
  category: string;
  dimensions: {
    width?: number;
    height?: number;
    length?: number;
    thickness?: number;
  };
  species?: string;
  grade?: string;
  treatment?: string;
  purpose?: string;
  confidence: number;
}

export class MaterialSpecNormalizer {
  // Material category patterns
  private static readonly MATERIAL_PATTERNS = {
    // Lumber patterns
    STUDS: {
      patterns: [/studs?/i, /^st/i],
      category: "lumber",
      defaultSpecies: "spf",
      defaultGrade: "stud"
    },
    PLATES: {
      patterns: [/plates?/i, /^pl/i],
      category: "lumber", 
      defaultSpecies: "spf",
      defaultGrade: "std"
    },
    JOISTS: {
      patterns: [/joists?/i, /^j/i, /floor_joists/i],
      category: "lumber",
      defaultSpecies: "spf", 
      defaultGrade: "std"
    },
    BEAMS: {
      patterns: [/beams?/i, /^b/i],
      category: "lumber",
      defaultSpecies: "spf",
      defaultGrade: "struct1"
    },
    HEADERS: {
      patterns: [/headers?/i, /^h/i],
      category: "lumber",
      defaultSpecies: "spf",
      defaultGrade: "struct1"
    },
    BLOCKING: {
      patterns: [/blocking/i, /^bl/i],
      category: "lumber",
      defaultSpecies: "spf",
      defaultGrade: "std"
    },
    
    // Sheathing patterns
    SHEATHING: {
      patterns: [/sheathing/i, /^sh/i],
      category: "sheathing",
      defaultSpecies: undefined,
      defaultGrade: "std"
    },
    OSB: {
      patterns: [/osb/i, /^o/i],
      category: "sheathing",
      defaultSpecies: undefined,
      defaultGrade: "std"
    },
    PLYWOOD: {
      patterns: [/ply(wood)?/i, /^p/i],
      category: "sheathing", 
      defaultSpecies: undefined,
      defaultGrade: "std"
    },
    
    // Fasteners
    NAILS: {
      patterns: [/nails?/i, /^n/i],
      category: "fastener",
      defaultSpecies: undefined,
      defaultGrade: "std"
    },
    SCREWS: {
      patterns: [/screws?/i, /^sc/i],
      category: "fastener",
      defaultSpecies: undefined,
      defaultGrade: "std"
    },
    FASTENERS: {
      patterns: [/fasteners?/i, /^f/i],
      category: "fastener",
      defaultSpecies: undefined,
      defaultGrade: "std"
    },
    
    // Connectors
    HANGERS: {
      patterns: [/hangers?/i, /^ha/i, /hanger_for/i],
      category: "connector",
      defaultSpecies: undefined,
      defaultGrade: "std"
    },
    CONNECTORS: {
      patterns: [/connectors?/i, /^c/i],
      category: "connector",
      defaultSpecies: undefined,
      defaultGrade: "std"
    },
    ANCHORS: {
      patterns: [/anchors?/i, /^an/i, /anchor_bolt/i],
      category: "connector",
      defaultSpecies: undefined,
      defaultGrade: "std"
    }
  };

  // Dimension patterns
  private static readonly DIMENSION_PATTERNS = {
    // Width x Height patterns
    LUMBER_DIMENSIONS: [
      /(\d+)x(\d+)/i,           // 2x4, 2x6, etc.
      /(\d+)\s*x\s*(\d+)/i,     // 2 x 4, 2 x 6, etc.
      /(\d+)\s*by\s*(\d+)/i,    // 2 by 4, 2 by 6, etc.
      /(\d+)\s*×\s*(\d+)/i,     // 2 × 4, 2 × 6, etc.
      /(\d+)X(\d+)/i            // 2X4, 2X6, etc. (uppercase X)
    ],
    
    // Thickness patterns
    THICKNESS: [
      /(\d+)\/(\d+)/i,          // 7/16, 5/8, etc.
      /(\d+)\.(\d+)/i,          // 0.75, 0.625, etc.
      /(\d+)\s*inch/i,          // 1 inch, 2 inch, etc.
      /(\d+)"?/i,               // 1", 2", etc.
      /(\d+)_(\d+)/i            // 7_16, 5_8, etc. (underscore separator)
    ],
    
    // Length patterns
    LENGTH: [
      /(\d+)ft/i,               // 8ft, 10ft, etc.
      /(\d+)'/i,                // 8', 10', etc.
      /(\d+)\s*foot/i,          // 8 foot, 10 foot, etc.
      /(\d+)\s*feet/i           // 8 feet, 10 feet, etc.
    ]
  };

  // Species patterns
  private static readonly SPECIES_PATTERNS = {
    SPF: [/spf/i, /spruce/i, /pine/i, /fir/i, /^s/i],
    DF: [/df/i, /douglas/i, /fir/i, /^d/i],
    SYP: [/syp/i, /southern/i, /yellow/i, /pine/i],
    LVL: [/lvl/i, /laminated/i, /veneer/i, /lumber/i],
    PSL: [/psl/i, /parallel/i, /strand/i, /lumber/i],
    GLULAM: [/glulam/i, /glue/i, /laminated/i, /^g/i]
  };

  // Grade patterns
  private static readonly GRADE_PATTERNS = {
    STUD: [/stud/i, /^st/i],
    SELECT: [/select/i, /sel/i, /^se/i],
    STRUCTURAL: [/structural/i, /struct/i, /^str/i],
    STANDARD: [/standard/i, /std/i, /^st/i]
  };

  // Treatment patterns
  private static readonly TREATMENT_PATTERNS = {
    PRESSURE_TREATED: [/pressure/i, /treated/i, /pt/i, /^p/i],
    FIRE_RETARDANT: [/fire/i, /retardant/i, /fr/i, /^f/i],
    MOISTURE_RESISTANT: [/moisture/i, /resistant/i, /mr/i, /^m/i],
    G90: [/g90/i, /galvanized/i, /^g/i],
    ZMAX: [/zmax/i, /zmax/i, /^z/i]
  };

  /**
   * Normalize a material specification string to a human-readable format
   */
  static normalizeSpec(rawSpec: string): NormalizedMaterialSpec {
    const spec = rawSpec.trim();
    const upperSpec = spec.toUpperCase();
    
    // Initialize result
    const result: NormalizedMaterialSpec = {
      normalizedSpec: "",
      category: "misc",
      dimensions: {},
      confidence: 0.5
    };

    try {
      // Determine material category and base properties
      const categoryInfo = this.determineCategory(upperSpec);
      result.category = categoryInfo.category;
      result.species = categoryInfo.species;
      result.grade = categoryInfo.grade;
      result.confidence = categoryInfo.confidence;

      // Extract dimensions
      const dimensions = this.extractDimensions(spec);
      result.dimensions = dimensions;
      result.confidence += dimensions.width || dimensions.thickness ? 0.2 : 0;

      // Extract treatment
      const treatment = this.extractTreatment(upperSpec);
      result.treatment = treatment;
      result.confidence += treatment ? 0.1 : 0;

      // Extract purpose
      const purpose = this.extractPurpose(upperSpec);
      result.purpose = purpose;
      result.confidence += purpose ? 0.1 : 0;

      // Build normalized spec string
      result.normalizedSpec = this.buildNormalizedString(categoryInfo, dimensions, treatment, purpose);
      
      // Cap confidence at 1.0
      result.confidence = Math.min(result.confidence, 1.0);

    } catch (error) {
      console.warn(`Failed to normalize material spec "${rawSpec}":`, error);
      result.normalizedSpec = rawSpec;
      result.confidence = 0.1;
    }

    return result;
  }

  /**
   * Determine the material category and base properties
   */
  private static determineCategory(spec: string): {
    category: string;
    species?: string;
    grade?: string;
    confidence: number;
  } {
    let bestMatch = { category: "misc", species: undefined, grade: undefined, confidence: 0.5 };
    
    for (const [key, info] of Object.entries(this.MATERIAL_PATTERNS)) {
      for (const pattern of info.patterns) {
        if (pattern.test(spec)) {
          const confidence = 0.8;
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              category: info.category,
              species: info.defaultSpecies,
              grade: info.defaultGrade,
              confidence
            };
          }
          break;
        }
      }
    }

    // Try to extract species from the spec
    const extractedSpecies = this.extractSpecies(spec);
    if (extractedSpecies) {
      bestMatch.species = extractedSpecies;
      bestMatch.confidence += 0.1;
    }

    // Try to extract grade from the spec
    const extractedGrade = this.extractGrade(spec);
    if (extractedGrade) {
      bestMatch.grade = extractedGrade;
      bestMatch.confidence += 0.1;
    }

    return bestMatch;
  }

  /**
   * Extract dimensions from the spec string
   */
  private static extractDimensions(spec: string): {
    width?: number;
    height?: number;
    length?: number;
    thickness?: number;
  } {
    const dimensions: any = {};

    // Extract width x height (e.g., 2x4, 2x6)
    for (const pattern of this.DIMENSION_PATTERNS.LUMBER_DIMENSIONS) {
      const match = spec.match(pattern);
      if (match) {
        dimensions.width = parseInt(match[1]);
        dimensions.height = parseInt(match[2]);
        break;
      }
    }

    // Extract thickness (e.g., 7/16, 5/8)
    for (const pattern of this.DIMENSION_PATTERNS.THICKNESS) {
      const match = spec.match(pattern);
      if (match) {
        if (pattern.source.includes('/')) {
          // Fraction pattern (e.g., 7/16)
          dimensions.thickness = parseInt(match[1]) / parseInt(match[2]);
        } else {
          // Decimal pattern (e.g., 0.75)
          dimensions.thickness = parseFloat(match[1] + '.' + match[2]);
        }
        break;
      }
    }

    // Extract length (e.g., 8ft, 10')
    for (const pattern of this.DIMENSION_PATTERNS.LENGTH) {
      const match = spec.match(pattern);
      if (match) {
        dimensions.length = parseInt(match[1]);
        break;
      }
    }

    return dimensions;
  }

  /**
   * Extract species information
   */
  private static extractSpecies(spec: string): string | undefined {
    for (const [species, patterns] of Object.entries(this.SPECIES_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(spec)) {
          return species;
        }
      }
    }
    return undefined;
  }

  /**
   * Extract grade information
   */
  private static extractGrade(spec: string): string | undefined {
    for (const [grade, patterns] of Object.entries(this.GRADE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(spec)) {
          return grade;
        }
      }
    }
    return undefined;
  }

  /**
   * Extract treatment information
   */
  private static extractTreatment(spec: string): string | undefined {
    for (const [treatment, patterns] of Object.entries(this.TREATMENT_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(spec)) {
          return treatment;
        }
      }
    }
    return undefined;
  }

  /**
   * Extract purpose information
   */
  private static extractPurpose(spec: string): string | undefined {
    const purposePatterns = [
      { pattern: /bottom/i, purpose: "bottom" },
      { pattern: /top/i, purpose: "top" },
      { pattern: /double/i, purpose: "double" },
      { pattern: /exterior/i, purpose: "exterior" },
      { pattern: /interior/i, purpose: "interior" },
      { pattern: /floor/i, purpose: "floor" },
      { pattern: /wall/i, purpose: "wall" },
      { pattern: /ceiling/i, purpose: "ceiling" },
      { pattern: /roof/i, purpose: "roof" }
    ];

    for (const { pattern, purpose } of purposePatterns) {
      if (pattern.test(spec)) {
        return purpose;
      }
    }
    return undefined;
  }

  /**
   * Build the normalized material specification string
   */
  private static buildNormalizedString(
    categoryInfo: { category: string; species?: string; grade?: string },
    dimensions: { width?: number; height?: number; length?: number; thickness?: number },
    treatment?: string,
    purpose?: string
  ): string {
    const parts: string[] = [];

    // Add dimensions
    if (dimensions.width && dimensions.height) {
      parts.push(`${dimensions.width}x${dimensions.height}`);
    } else if (dimensions.thickness) {
      parts.push(`${dimensions.thickness}"`);
    }

    // Add species
    if (categoryInfo.species) {
      parts.push(categoryInfo.species.toLowerCase());
    }

    // Add material type based on category
    switch (categoryInfo.category) {
      case "lumber":
        if (categoryInfo.grade === "stud") {
          parts.push("stud");
        } else if (dimensions.width && dimensions.height) {
          parts.push("lumber");
        }
        break;
      case "sheathing":
        if (dimensions.thickness) {
          parts.push("sheathing");
        }
        break;
      case "fastener":
        parts.push("fastener");
        break;
      case "connector":
        parts.push("connector");
        break;
    }

    // Add grade
    if (categoryInfo.grade && categoryInfo.grade !== "std") {
      parts.push(categoryInfo.grade.toLowerCase());
    }

    // Add treatment
    if (treatment) {
      parts.push(treatment.toLowerCase().replace(/_/g, " "));
    }

    // Add purpose
    if (purpose) {
      parts.push(purpose);
    }

    // Add length if specified
    if (dimensions.length) {
      parts.push(`${dimensions.length}ft`);
    }

    return parts.join(" ");
  }

  /**
   * Get a human-readable description of the material
   */
  static getDescription(normalizedSpec: NormalizedMaterialSpec): string {
    const parts: string[] = [];

    if (normalizedSpec.dimensions.width && normalizedSpec.dimensions.height) {
      parts.push(`${normalizedSpec.dimensions.width}×${normalizedSpec.dimensions.height}`);
    }

    if (normalizedSpec.species) {
      parts.push(normalizedSpec.species.toUpperCase());
    }

    if (normalizedSpec.grade && normalizedSpec.grade !== "std") {
      parts.push(normalizedSpec.grade);
    }

    if (normalizedSpec.treatment) {
      parts.push(normalizedSpec.treatment.replace(/_/g, " "));
    }

    if (normalizedSpec.purpose) {
      parts.push(normalizedSpec.purpose);
    }

    if (normalizedSpec.dimensions.length) {
      parts.push(`${normalizedSpec.dimensions.length}ft`);
    }

    return parts.join(" ");
  }
}
