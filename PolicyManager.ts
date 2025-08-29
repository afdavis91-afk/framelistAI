import { Policy, PolicySchema } from './types';

export class PolicyManager {
  private static instance: PolicyManager;
  private defaultPolicy: Policy;
  private projectPolicies: Map<string, Policy> = new Map();
  private policyCache: Map<string, Policy> = new Map();

  private constructor() {
    this.defaultPolicy = this.createDefaultPolicy();
  }

  static getInstance(): PolicyManager {
    if (!PolicyManager.instance) {
      PolicyManager.instance = new PolicyManager();
    }
    return PolicyManager.instance;
  }

  /**
   * Get policy by ID, with fallback to default
   */
  getPolicy(policyId: string): Policy {
    // Check cache first
    if (this.policyCache.has(policyId)) {
      return this.policyCache.get(policyId)!;
    }

    // Check project policies
    if (this.projectPolicies.has(policyId)) {
      const policy = this.projectPolicies.get(policyId)!;
      this.policyCache.set(policyId, policy);
      return policy;
    }

    // Fallback to default policy
    if (policyId === 'default' || policyId === 'legacy_compat_v0') {
      return this.defaultPolicy;
    }

    // If policy not found, return default with warning
    console.warn(`Policy ${policyId} not found, falling back to default`);
    return this.defaultPolicy;
  }

  /**
   * Load project-specific policy
   */
  loadProjectPolicy(projectId: string, policyData: Partial<Policy>): Policy {
    try {
      // Merge with default policy
      const mergedPolicy = this.mergeWithDefault(policyData);
      
      // Validate the merged policy
      PolicySchema.parse(mergedPolicy);
      
      // Store in project policies
      this.projectPolicies.set(projectId, mergedPolicy);
      
      // Clear cache for this project
      this.policyCache.delete(projectId);
      
      return mergedPolicy;
    } catch (error) {
      console.error(`Failed to load project policy for ${projectId}:`, error);
      return this.defaultPolicy;
    }
  }

  /**
   * Create a custom policy for testing/scenarios
   */
  createCustomPolicy(overrides: Partial<Policy>): Policy {
    try {
      const customPolicy = this.mergeWithDefault(overrides);
      PolicySchema.parse(customPolicy);
      return customPolicy;
    } catch (error) {
      console.error('Failed to create custom policy:', error);
      return this.defaultPolicy;
    }
  }

  /**
   * Validate a policy configuration
   */
  validatePolicy(policy: Policy): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      PolicySchema.parse(policy);
    } catch (error) {
      errors.push(`Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Custom validation rules
    if (policy.thresholds.acceptInference < 0.5) {
      errors.push('acceptInference threshold should be >= 0.5 for reliable results');
    }

    if (policy.thresholds.conflictGap < 0.1) {
      errors.push('conflictGap threshold should be >= 0.1 to avoid excessive manual review');
    }

    if (policy.thresholds.maxAmbiguity > 0.5) {
      errors.push('maxAmbiguity threshold should be <= 0.5 to maintain quality');
    }

    // Validate source reliability weights sum to reasonable total
    const totalReliability = Object.values(policy.priors.sourceReliability).reduce((sum, weight) => sum + weight, 0);
    if (totalReliability < 2.0 || totalReliability > 5.0) {
      errors.push('Source reliability weights should sum to between 2.0 and 5.0');
    }

    // Validate tiebreakers reference valid source types
    const validSourceTypes = Object.keys(policy.priors.sourceReliability);
    const invalidTiebreakers = policy.tiebreakers.filter(tb => !validSourceTypes.includes(tb));
    if (invalidTiebreakers.length > 0) {
      errors.push(`Invalid tiebreakers: ${invalidTiebreakers.join(', ')}. Valid types: ${validSourceTypes.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get all available policy IDs
   */
  getAvailablePolicyIds(): string[] {
    return ['default', 'legacy_compat_v0', ...Array.from(this.projectPolicies.keys())];
  }

  /**
   * Clear policy cache
   */
  clearCache(): void {
    this.policyCache.clear();
  }

  /**
   * Create default policy with conservative settings
   */
  private createDefaultPolicy(): Policy {
    return {
      id: 'default',
      version: '1.0.0',
      thresholds: {
        acceptInference: 0.7,        // Minimum confidence to accept inference
        conflictGap: 0.15,           // Minimum gap to auto-resolve conflicts
        maxAmbiguity: 0.3,           // Maximum ambiguity before flagging
      },
      priors: {
        sourceReliability: {
          schedule_table: 0.9,       // Highest reliability
          explicit_note: 0.85,       // Direct callout
          plan_symbol: 0.8,          // Standard symbol
          vision_llm: 0.75,          // AI extraction
          assumed_default: 0.6,      // Code minimums
        },
      },
      tiebreakers: [
        'schedule_table',            // First priority
        'explicit_note',             // Second priority
        'plan_symbol',               // Third priority
        'vision_llm'                 // Last resort
      ],
      extraction: {
        maxVisionTokens: 100000,     // Vision API limits
        maxPages: 50,                // Document size limits
        enableGeometry: true,        // Geometric extraction
      },
      pricing: {
        minAccept: 0.8,              // Minimum confidence for pricing
        maxConcurrent: 5,            // Concurrent quote requests
        retries: 3,                  // Retry failed quotes
        timeoutMs: 30000,            // Quote timeout
        jitterMs: 1000,              // Request jitter
        maxQuoteAgeDays: 7,          // Quote freshness
        currency: 'USD',             // Default currency
        fxRate: 1.0,                 // Exchange rate
        priceAsOf: new Date().toISOString().split('T')[0], // Today's date
        vendorPrefs: [],             // No vendor preferences by default
      },
    };
  }

  /**
   * Merge custom policy with default policy
   */
  private mergeWithDefault(customPolicy: Partial<Policy>): Policy {
    const defaultPolicy = this.defaultPolicy;
    
    return {
      id: customPolicy.id || defaultPolicy.id,
      version: customPolicy.version || defaultPolicy.version,
      thresholds: {
        ...defaultPolicy.thresholds,
        ...customPolicy.thresholds,
      },
      priors: {
        sourceReliability: {
          ...defaultPolicy.priors.sourceReliability,
          ...customPolicy.priors?.sourceReliability,
        },
      },
      tiebreakers: customPolicy.tiebreakers || defaultPolicy.tiebreakers,
      extraction: {
        ...defaultPolicy.extraction,
        ...customPolicy.extraction,
      },
      pricing: {
        ...defaultPolicy.pricing,
        ...customPolicy.pricing,
      },
    };
  }
}

// Export singleton instance
export const policyManager = PolicyManager.getInstance();
