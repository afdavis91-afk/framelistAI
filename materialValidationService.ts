import { TakeoffLineItem, MaterialSpec, TakeoffFlag } from "../types/construction";

interface ValidationRule {
  id: string;
  name: string;
  description: string;
  category: "material" | "quantity" | "specification" | "code_compliance";
  severity: "low" | "medium" | "high" | "critical";
  validate: (item: TakeoffLineItem) => ValidationResult;
}

interface ValidationResult {
  passed: boolean;
  message?: string;
  suggestion?: string;
  confidenceAdjustment?: number; // -1 to 1
}

interface MaterialValidationReport {
  itemId: string;
  originalConfidence: number;
  adjustedConfidence: number;
  validationResults: Array<{
    rule: ValidationRule;
    result: ValidationResult;
  }>;
  flags: TakeoffFlag[];
}

export class MaterialValidationService {
  private validationRules: ValidationRule[] = [
    // Material Specification Rules
    {
      id: "material_spec_completeness",
      name: "Material Specification Completeness",
      description: "Validates that essential material properties are specified",
      category: "material",
      severity: "high",
      validate: (item) => this.validateMaterialCompleteness(item)
    },
    {
      id: "lumber_grade_consistency",
      name: "Lumber Grade Consistency",
      description: "Validates lumber grade matches species and application",
      category: "specification",
      severity: "medium",
      validate: (item) => this.validateLumberGrade(item)
    },
    {
      id: "fastener_compatibility",
      name: "Fastener Compatibility",
      description: "Validates fasteners are appropriate for material and application",
      category: "specification",
      severity: "high",
      validate: (item) => this.validateFastenerCompatibility(item)
    },
    {
      id: "connector_load_rating",
      name: "Connector Load Rating",
      description: "Validates structural connectors have adequate load ratings",
      category: "code_compliance",
      severity: "critical",
      validate: (item) => this.validateConnectorLoadRating(item)
    },
    
    // Quantity Validation Rules
    {
      id: "quantity_reasonableness",
      name: "Quantity Reasonableness",
      description: "Validates quantities are within reasonable ranges",
      category: "quantity",
      severity: "medium",
      validate: (item) => this.validateQuantityReasonableness(item)
    },
    {
      id: "waste_factor_application",
      name: "Waste Factor Application",
      description: "Validates appropriate waste factors are applied",
      category: "quantity",
      severity: "low",
      validate: (item) => this.validateWasteFactors(item)
    },
    
    // Code Compliance Rules
    {
      id: "fire_rating_compliance",
      name: "Fire Rating Compliance",
      description: "Validates fire rating requirements are met",
      category: "code_compliance",
      severity: "high",
      validate: (item) => this.validateFireRating(item)
    },
    {
      id: "seismic_requirements",
      name: "Seismic Requirements",
      description: "Validates seismic design requirements are addressed",
      category: "code_compliance",
      severity: "high",
      validate: (item) => this.validateSeismicRequirements(item)
    }
  ];

  /**
   * Validate all line items and generate comprehensive report
   */
  async validateMaterials(
    lineItems: TakeoffLineItem[],
    onProgress?: (progress: number) => void
  ): Promise<MaterialValidationReport[]> {
    const reports: MaterialValidationReport[] = [];
    
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const report = await this.validateSingleItem(item);
      reports.push(report);
      
      onProgress?.(((i + 1) / lineItems.length) * 100);
    }
    
    return reports;
  }

  /**
   * Validate a single line item against all rules
   */
  private async validateSingleItem(item: TakeoffLineItem): Promise<MaterialValidationReport> {
    const validationResults: Array<{ rule: ValidationRule; result: ValidationResult }> = [];
    const flags: TakeoffFlag[] = [];
    let confidenceAdjustment = 0;

    for (const rule of this.validationRules) {
      try {
        const result = rule.validate(item);
        validationResults.push({ rule, result });

        // Apply confidence adjustment
        if (result.confidenceAdjustment) {
          confidenceAdjustment += result.confidenceAdjustment;
        }

        // Create flags for failed validations
        if (!result.passed) {
          flags.push({
            type: this.getFlagTypeFromCategory(rule.category),
            message: result.message || `${rule.name}: Validation failed`,
            severity: rule.severity,
            sheets: item.context.sheetRef ? [item.context.sheetRef] : [],
            resolved: false
          });
        }
      } catch (error) {
        console.warn(`[MaterialValidation] Rule ${rule.id} failed for item ${item.itemId}:`, error);
        
        flags.push({
          type: "ASSUMPTION",
          message: `Validation rule ${rule.name} could not be applied`,
          severity: "low",
          sheets: [item.context.sheetRef],
          resolved: false
        });
      }
    }

    const adjustedConfidence = Math.max(0.1, Math.min(1.0, item.confidence + confidenceAdjustment));

    return {
      itemId: item.itemId,
      originalConfidence: item.confidence,
      adjustedConfidence,
      validationResults,
      flags
    };
  }

  /**
   * Validate material specification completeness
   */
  private validateMaterialCompleteness(item: TakeoffLineItem): ValidationResult {
    const material = item.material;
    const missingFields: string[] = [];

    // Check essential fields based on material type
    if (!material.spec || material.spec === "Unknown") {
      missingFields.push("specification");
    }

    if (this.isStructuralMaterial(item) && !material.grade) {
      missingFields.push("grade");
    }

    if (this.isLumberMaterial(item) && !material.species) {
      missingFields.push("species");
    }

    if (this.requiresDimensions(item)) {
      if (!material.size && (!material.width || !material.height)) {
        missingFields.push("dimensions");
      }
    }

    if (missingFields.length === 0) {
      return {
        passed: true,
        confidenceAdjustment: 0.1
      };
    }

    return {
      passed: false,
      message: `Missing material properties: ${missingFields.join(", ")}`,
      suggestion: "Review source documents for complete material specifications",
      confidenceAdjustment: -0.2
    };
  }

  /**
   * Validate lumber grade consistency
   */
  private validateLumberGrade(item: TakeoffLineItem): ValidationResult {
    if (!this.isLumberMaterial(item)) {
      return { passed: true };
    }

    const { species, grade } = item.material;
    
    if (!species || !grade) {
      return { passed: true }; // Handled by completeness check
    }

    // Define valid grade combinations
    const validCombinations: Record<string, string[]> = {
      "SPF": ["No.2", "No.1", "Select Structural", "Construction", "Standard", "Utility"],
      "DF-L": ["No.2", "No.1", "Select Structural", "Construction", "Standard"],
      "SYP": ["No.2", "No.1", "Select Structural", "Dense Select Structural"],
      "Hem-Fir": ["No.2", "No.1", "Select Structural", "Construction", "Standard"]
    };

    const normalizedSpecies = this.normalizeSpeciesName(species);
    const validGrades = validCombinations[normalizedSpecies];

    if (!validGrades) {
      return {
        passed: false,
        message: `Unknown species: ${species}`,
        suggestion: "Verify species specification against lumber standards",
        confidenceAdjustment: -0.1
      };
    }

    if (!validGrades.includes(grade)) {
      return {
        passed: false,
        message: `Grade ${grade} not valid for species ${species}`,
        suggestion: `Valid grades for ${species}: ${validGrades.join(", ")}`,
        confidenceAdjustment: -0.15
      };
    }

    return {
      passed: true,
      confidenceAdjustment: 0.05
    };
  }

  /**
   * Validate fastener compatibility
   */
  private validateFastenerCompatibility(item: TakeoffLineItem): ValidationResult {
    const { fastenerType, fastenerSize } = item.material;
    
    if (!fastenerType) {
      return { passed: true }; // Not applicable
    }

    // Check galvanization requirements for treated lumber
    if (item.material.treatment?.toLowerCase().includes("pressure") && 
        fastenerType.toLowerCase().includes("nail") &&
        !item.nailingSchedule?.galvanized) {
      return {
        passed: false,
        message: "Galvanized fasteners required for pressure-treated lumber",
        suggestion: "Specify galvanized nails for pressure-treated applications",
        confidenceAdjustment: -0.2
      };
    }

    // Check fastener size appropriateness
    if (fastenerSize && item.material.size) {
      const materialThickness = this.extractThickness(item.material.size);
      const fastenerLength = this.extractFastenerLength(fastenerSize);
      
      if (materialThickness && fastenerLength) {
        const penetrationRatio = fastenerLength / materialThickness;
        
        if (penetrationRatio < 1.5) {
          return {
            passed: false,
            message: `Fastener may be too short: ${fastenerSize} for ${item.material.size}`,
            suggestion: "Ensure adequate fastener penetration (minimum 1.5x material thickness)",
            confidenceAdjustment: -0.1
          };
        }
      }
    }

    return {
      passed: true,
      confidenceAdjustment: 0.05
    };
  }

  /**
   * Validate connector load ratings
   */
  private validateConnectorLoadRating(item: TakeoffLineItem): ValidationResult {
    const { connectorType } = item.material;
    
    if (!connectorType || !this.isStructuralConnector(connectorType)) {
      return { passed: true }; // Not applicable
    }

    // Check for load rating specification
    if (!item.material.hangerLoadRating && !item.material.designLoad) {
      return {
        passed: false,
        message: "Structural connector missing load rating specification",
        suggestion: "Specify load rating for structural connectors per manufacturer data",
        confidenceAdjustment: -0.3
      };
    }

    // Check seismic rating for seismic zones
    if (this.requiresSeismicRating(item) && !item.material.seismicRated) {
      return {
        passed: false,
        message: "Seismic-rated connector required for this application",
        suggestion: "Specify seismic-rated connectors for seismic design categories D and higher",
        confidenceAdjustment: -0.25
      };
    }

    return {
      passed: true,
      confidenceAdjustment: 0.1
    };
  }

  /**
   * Validate quantity reasonableness
   */
  private validateQuantityReasonableness(item: TakeoffLineItem): ValidationResult {
    const { qty, uom } = item;
    
    // Define reasonable ranges by UOM and material type
    const ranges = this.getReasonableRanges(item);
    
    if (ranges && (qty < ranges.min || qty > ranges.max)) {
      return {
        passed: false,
        message: `Quantity ${qty} ${uom} outside reasonable range (${ranges.min}-${ranges.max})`,
        suggestion: "Verify quantity calculation and measurement units",
        confidenceAdjustment: -0.15
      };
    }

    // Check for suspiciously round numbers that might indicate estimates
    if (this.isSuspiciouslyRound(qty)) {
      return {
        passed: false,
        message: "Quantity appears to be an estimate (round number)",
        suggestion: "Verify with detailed measurements if possible",
        confidenceAdjustment: -0.05
      };
    }

    return {
      passed: true,
      confidenceAdjustment: 0.02
    };
  }

  /**
   * Validate waste factor application
   */
  private validateWasteFactors(item: TakeoffLineItem): ValidationResult {
    if (!item.waste) {
      return {
        passed: false,
        message: "No waste factor applied",
        suggestion: "Apply appropriate waste factors for material type",
        confidenceAdjustment: -0.05
      };
    }

    const expectedWaste = this.getExpectedWasteFactor(item);
    const actualWaste = item.waste.wastePercentage;
    
    if (Math.abs(actualWaste - expectedWaste) > 5) {
      return {
        passed: false,
        message: `Waste factor ${actualWaste}% differs from typical ${expectedWaste}%`,
        suggestion: `Consider using standard waste factor of ${expectedWaste}% for this material`,
        confidenceAdjustment: -0.03
      };
    }

    return {
      passed: true,
      confidenceAdjustment: 0.02
    };
  }

  /**
   * Validate fire rating compliance
   */
  private validateFireRating(item: TakeoffLineItem): ValidationResult {
    const { fireRating } = item.material;
    
    if (this.requiresFireRating(item) && !fireRating) {
      return {
        passed: false,
        message: "Fire rating required but not specified",
        suggestion: "Specify fire rating per building code requirements",
        confidenceAdjustment: -0.2
      };
    }

    if (fireRating && !this.isValidFireRating(fireRating)) {
      return {
        passed: false,
        message: `Invalid fire rating: ${fireRating}`,
        suggestion: "Use standard fire ratings (20min, 45min, 1hr, 2hr, etc.)",
        confidenceAdjustment: -0.1
      };
    }

    return {
      passed: true,
      confidenceAdjustment: fireRating ? 0.05 : 0
    };
  }

  /**
   * Validate seismic requirements
   */
  private validateSeismicRequirements(item: TakeoffLineItem): ValidationResult {
    if (!this.requiresSeismicDesign(item)) {
      return { passed: true };
    }

    const { connectorType, seismicRated } = item.material;
    
    if (connectorType && this.isStructuralConnector(connectorType) && !seismicRated) {
      return {
        passed: false,
        message: "Seismic-rated connector required for seismic design",
        suggestion: "Specify seismic-rated connectors per seismic design requirements",
        confidenceAdjustment: -0.25
      };
    }

    return {
      passed: true,
      confidenceAdjustment: seismicRated ? 0.1 : 0
    };
  }

  // Helper methods
  private getFlagTypeFromCategory(category: string): "MISSING_INFO" | "CONFLICT" | "ASSUMPTION" | "LOW_CONFIDENCE" | "SPEC_UNCLEAR" {
    switch (category) {
      case "material":
      case "specification":
        return "SPEC_UNCLEAR";
      case "quantity":
        return "LOW_CONFIDENCE";
      case "code_compliance":
        return "CONFLICT";
      default:
        return "ASSUMPTION";
    }
  }

  private isStructuralMaterial(item: TakeoffLineItem): boolean {
    const scope = item.context.scope.toLowerCase();
    return scope.includes("beam") || scope.includes("joist") || scope.includes("rafter") || 
           scope.includes("header") || scope.includes("column") || scope.includes("post");
  }

  private isLumberMaterial(item: TakeoffLineItem): boolean {
    const spec = item.material.spec.toLowerCase();
    return spec.includes("2x") || spec.includes("lumber") || 
           item.material.species !== undefined;
  }

  private requiresDimensions(item: TakeoffLineItem): boolean {
    return this.isLumberMaterial(item) || this.isStructuralMaterial(item);
  }

  private normalizeSpeciesName(species: string): string {
    const normalized = species.toUpperCase().replace(/[^A-Z-]/g, "");
    
    // Common species mappings
    const mappings: Record<string, string> = {
      "DOUGLAS-FIR": "DF-L",
      "DOUGLASFIR": "DF-L",
      "SOUTHERN-PINE": "SYP",
      "SOUTHERNPINE": "SYP",
      "SPRUCE-PINE-FIR": "SPF",
      "SPRUCEPIEFIR": "SPF",
      "HEMLOCK-FIR": "Hem-Fir",
      "HEMLOCKFIR": "Hem-Fir"
    };

    return mappings[normalized] || normalized;
  }

  private extractThickness(size: string): number | null {
    const match = size.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  private extractFastenerLength(size: string): number | null {
    // Extract length from fastener size (e.g., "16d" = 3.5", "3.5\"" = 3.5")
    if (size.includes("d")) {
      const pennySize = parseInt(size);
      const lengthMap: Record<number, number> = {
        6: 2, 8: 2.5, 10: 3, 12: 3.25, 16: 3.5, 20: 4
      };
      return lengthMap[pennySize] || null;
    }
    
    const match = size.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  private isStructuralConnector(connectorType: string): boolean {
    const structural = ["hold_down", "strap", "post_anchor", "beam_hanger", "joist_hanger"];
    return structural.some(type => connectorType.toLowerCase().includes(type));
  }

  private requiresSeismicRating(item: TakeoffLineItem): boolean {
    // This would typically check project seismic design category
    // For now, assume seismic requirements for structural connectors
    return this.isStructuralConnector(item.material.connectorType || "");
  }

  private getReasonableRanges(item: TakeoffLineItem): { min: number; max: number } | null {
    const { uom } = item;
    const scope = item.context.scope.toLowerCase();
    
    // Define ranges based on UOM and scope
    if (uom === "EA") {
      if (scope.includes("stud")) return { min: 1, max: 1000 };
      if (scope.includes("joist")) return { min: 1, max: 500 };
      if (scope.includes("connector")) return { min: 1, max: 200 };
      return { min: 1, max: 10000 };
    }
    
    if (uom === "LF") {
      if (scope.includes("plate")) return { min: 10, max: 5000 };
      if (scope.includes("blocking")) return { min: 5, max: 2000 };
      return { min: 1, max: 10000 };
    }
    
    if (uom === "SF") {
      return { min: 10, max: 50000 };
    }
    
    return null;
  }

  private isSuspiciouslyRound(qty: number): boolean {
    // Check if number is suspiciously round (ends in multiple zeros)
    return qty >= 100 && qty % 100 === 0;
  }

  private getExpectedWasteFactor(item: TakeoffLineItem): number {
    const scope = item.context.scope.toLowerCase();
    
    if (scope.includes("stud")) return 10;
    if (scope.includes("plate")) return 5;
    if (scope.includes("sheathing")) return 10;
    if (scope.includes("blocking")) return 15;
    if (scope.includes("fastener")) return 5;
    
    return 10; // Default
  }

  private requiresFireRating(item: TakeoffLineItem): boolean {
    const scope = item.context.scope.toLowerCase();
    return scope.includes("fire") || scope.includes("rated") || 
           item.material.fireRating !== undefined;
  }

  private isValidFireRating(rating: string): boolean {
    const validRatings = ["20min", "30min", "45min", "1hr", "2hr", "3hr", "4hr"];
    return validRatings.includes(rating.toLowerCase());
  }

  private requiresSeismicDesign(item: TakeoffLineItem): boolean {
    // This would check project seismic design category from project settings
    // For now, assume seismic requirements for structural elements
    return this.isStructuralMaterial(item) || 
           this.isStructuralConnector(item.material.connectorType || "");
  }
}

export const materialValidationService = new MaterialValidationService();