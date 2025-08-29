/**
 * Robust JSON parsing utilities for handling AI responses
 * Provides multiple extraction strategies and repair mechanisms
 */

export interface JSONExtractionResult {
  success: boolean;
  data?: any;
  error?: string;
  extractedText?: string;
  repairAttempted?: boolean;
  partialData?: any;
}

export interface JSONRepairOptions {
  attemptRepair?: boolean;
  maxRepairAttempts?: number;
  logErrors?: boolean;
  fallbackToPartial?: boolean;
}

/**
 * Robust JSON extractor with multiple fallback strategies
 */
export class RobustJSONParser {
  private static readonly EXTRACTION_PATTERNS = [
    // Fenced JSON with optional language specifier
    /```(?:json)?\s*([\s\S]*?)\s*```/i,
    // JSON object with proper braces
    /(\{[\s\S]*\})/,
    // JSON array
    /(\[[\s\S]*\])/,
    // Partial JSON starting with opening brace
    /(\{[\s\S]*)/,
    // JSON-like content between markers
    /(?:json|JSON)\s*[:\-=]?\s*(\{[\s\S]*)/i,
  ];

  private static readonly COMMON_TRUNCATION_PATTERNS = [
    // Missing closing brace
    { pattern: /(\{[^}]*?)$/, repair: (match: string) => match + '}' },
    // Missing closing bracket
    { pattern: /(\[[^\]]*?)$/, repair: (match: string) => match + ']' },
    // Incomplete string
    { pattern: /"([^"]*?)$/, repair: (match: string) => match + '"' },
    // Missing comma before closing
    { pattern: /([^,\s])\s*(\}|\])$/, repair: (match: string) => match.replace(/([^,\s])\s*(\}|\])$/, '$1$2') },
    // Incomplete array element
    { pattern: /,\s*$/, repair: (match: string) => match.slice(0, -1) },
  ];

  /**
   * Extract JSON from AI response with multiple strategies
   */
  static extractJSON(response: string, options: JSONRepairOptions = {}): JSONExtractionResult {
    const { attemptRepair = true, maxRepairAttempts = 3, logErrors = true, fallbackToPartial = true } = options;

    if (!response || typeof response !== 'string') {
      return {
        success: false,
        error: 'Invalid response: empty or non-string input',
      };
    }

    // Try each extraction pattern
    for (const pattern of this.EXTRACTION_PATTERNS) {
      const match = response.match(pattern);
      if (match && match[1]) {
        const jsonText = match[1].trim();
        
        // Try direct parsing first
        const directResult = this.tryParseJSON(jsonText);
        if (directResult.success) {
          return {
            success: true,
            data: directResult.data,
            extractedText: jsonText,
          };
        }

        // Try repair if enabled
        if (attemptRepair) {
          const repairResult = this.repairAndParseJSON(jsonText, maxRepairAttempts, logErrors);
          if (repairResult.success) {
            return {
              success: true,
              data: repairResult.data,
              extractedText: repairResult.repairedText || jsonText,
              repairAttempted: true,
            };
          }
        }

        // Try partial extraction if enabled
        if (fallbackToPartial) {
          const partialResult = this.extractPartialJSON(jsonText, logErrors);
          if (partialResult.success) {
            return {
              success: true,
              data: partialResult.data,
              extractedText: jsonText,
              partialData: partialResult.data,
            };
          }
        }
      }
    }

    return {
      success: false,
      error: 'No valid JSON found in response',
      extractedText: response.substring(0, 500) + (response.length > 500 ? '...' : ''),
    };
  }

  /**
   * Attempt to parse JSON with error handling
   */
  private static tryParseJSON(jsonText: string): { success: boolean; data?: any; error?: string } {
    try {
      const parsed = JSON.parse(jsonText);
      return { success: true, data: parsed };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parsing error',
      };
    }
  }

  /**
   * Repair common JSON truncation issues and attempt parsing
   */
  private static repairAndParseJSON(
    jsonText: string, 
    maxAttempts: number, 
    logErrors: boolean
  ): { success: boolean; data?: any; repairedText?: string; error?: string } {
    let currentText = jsonText;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      // Try each repair pattern
      for (const { pattern, repair } of this.COMMON_TRUNCATION_PATTERNS) {
        if (pattern.test(currentText)) {
          const repairedText = repair(currentText);
          
          if (logErrors) {
            console.log(`[JSONParser] Repair attempt ${attempts}: Applied pattern ${pattern.source}`);
          }

          const parseResult = this.tryParseJSON(repairedText);
          if (parseResult.success) {
            return {
              success: true,
              data: parseResult.data,
              repairedText,
            };
          }

          currentText = repairedText;
          break;
        }
      }

      // Try smart completion based on JSON structure
      const smartRepair = this.smartRepairJSON(currentText);
      if (smartRepair !== currentText) {
        const parseResult = this.tryParseJSON(smartRepair);
        if (parseResult.success) {
          return {
            success: true,
            data: parseResult.data,
            repairedText: smartRepair,
          };
        }
        currentText = smartRepair;
      }
    }

    return {
      success: false,
      error: `Failed to repair JSON after ${maxAttempts} attempts`,
    };
  }

  /**
   * Smart JSON repair based on structure analysis
   */
  private static smartRepairJSON(jsonText: string): string {
    let repaired = jsonText;

    // Count braces and brackets
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    // Add missing closing braces
    const missingBraces = openBraces - closeBraces;
    if (missingBraces > 0) {
      repaired += '}'.repeat(missingBraces);
    }

    // Add missing closing brackets
    const missingBrackets = openBrackets - closeBrackets;
    if (missingBrackets > 0) {
      repaired += ']'.repeat(missingBrackets);
    }

    // Fix incomplete strings
    const incompleteString = repaired.match(/"[^"]*$/);
    if (incompleteString) {
      repaired += '"';
    }

    // Remove trailing commas before closing
    repaired = repaired.replace(/,(\s*[\}\]])/g, '$1');

    return repaired;
  }

  /**
   * Extract partial valid JSON sections
   */
  private static extractPartialJSON(
    jsonText: string, 
    logErrors: boolean
  ): { success: boolean; data?: any; error?: string } {
    try {
      // Try to extract individual sections that might be valid
      const sections = {
        project: this.extractSection(jsonText, 'project'),
        takeoff: this.extractSection(jsonText, 'takeoff'),
        flags: this.extractSection(jsonText, 'flags'),
        wallTypes: this.extractSection(jsonText, 'wallTypes'),
        confidence: this.extractSection(jsonText, 'confidence'),
      };

      // Build partial result from valid sections
      const partialResult: any = {};
      let hasValidData = false;

      Object.entries(sections).forEach(([key, value]) => {
        if (value !== null) {
          partialResult[key] = value;
          hasValidData = true;
        }
      });

      if (hasValidData) {
        if (logErrors) {
          console.log('[JSONParser] Extracted partial data:', Object.keys(partialResult));
        }
        return { success: true, data: partialResult };
      }

      return { success: false, error: 'No valid sections found' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Partial extraction failed',
      };
    }
  }

  /**
   * Extract a specific section from JSON text
   */
  private static extractSection(jsonText: string, sectionName: string): any {
    try {
      // Look for the section in the JSON text
      const sectionPattern = new RegExp(`"${sectionName}"\\s*:\\s*([^,}\\]]+(?:[,}\\]]|$))`, 'i');
      const match = jsonText.match(sectionPattern);
      
      if (match && match[1]) {
        let sectionValue = match[1].trim();
        
        // Handle different value types
        if (sectionValue.startsWith('"') && sectionValue.endsWith('"')) {
          // String value
          return sectionValue.slice(1, -1);
        } else if (sectionValue.startsWith('[')) {
          // Array value - try to find complete array
          const arrayMatch = jsonText.match(new RegExp(`"${sectionName}"\\s*:\\s*(\\[[^\\]]*\\])`, 'i'));
          if (arrayMatch && arrayMatch[1]) {
            return JSON.parse(arrayMatch[1]);
          }
        } else if (sectionValue.startsWith('{')) {
          // Object value - try to find complete object
          const objectMatch = jsonText.match(new RegExp(`"${sectionName}"\\s*:\\s*(\\{[^}]*\\})`, 'i'));
          if (objectMatch && objectMatch[1]) {
            return JSON.parse(objectMatch[1]);
          }
        } else if (!isNaN(Number(sectionValue))) {
          // Numeric value
          return Number(sectionValue);
        } else if (sectionValue === 'true' || sectionValue === 'false') {
          // Boolean value
          return sectionValue === 'true';
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate JSON structure against expected schema
   */
  static validateJSONStructure(data: any): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Root data must be an object');
      return { valid: false, errors, warnings };
    }

    // Check required top-level fields
    const requiredFields = ['takeoff', 'flags', 'confidence'];
    requiredFields.forEach(field => {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate takeoff array
    if ('takeoff' in data) {
      if (!Array.isArray(data.takeoff)) {
        errors.push('takeoff must be an array');
      } else {
        data.takeoff.forEach((item: any, index: number) => {
          if (!item || typeof item !== 'object') {
            errors.push(`takeoff[${index}] must be an object`);
          } else {
            if (!item.itemId) warnings.push(`takeoff[${index}] missing itemId`);
            if (!item.uom) warnings.push(`takeoff[${index}] missing uom`);
            if (typeof item.qty !== 'number') warnings.push(`takeoff[${index}] qty must be a number`);
          }
        });
      }
    }

    // Validate flags array
    if ('flags' in data) {
      if (!Array.isArray(data.flags)) {
        errors.push('flags must be an array');
      }
    }

    // Validate confidence
    if ('confidence' in data) {
      const confidence = data.confidence;
      if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
        errors.push('confidence must be a number between 0 and 1');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}