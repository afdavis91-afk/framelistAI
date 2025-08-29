export class FeatureFlags {
  private static instance: FeatureFlags;
  private flags: Map<string, boolean> = new Map();

  private constructor() {
    // Initialize with defaults - all new features OFF by default
    this.flags.set("useNewLedger", false);
    this.flags.set("enableAuditTrail", false);
    this.flags.set("useConflictResolver", false);
    this.flags.set("enableVisionStrategies", false);
    this.flags.set("enableAssumptiveBackfill", true);
    this.flags.set("enableStructuralOnlyEnhancements", true);
  }

  static getInstance(): FeatureFlags {
    if (!FeatureFlags.instance) {
      FeatureFlags.instance = new FeatureFlags();
    }
    return FeatureFlags.instance;
  }

  /**
   * Check if a feature flag is enabled
   */
  isEnabled(flagName: string): boolean {
    return this.flags.get(flagName) ?? false;
  }

  /**
   * Set a feature flag value
   */
  setFlag(flagName: string, value: boolean): void {
    this.flags.set(flagName, value);
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [key, value] of this.flags.entries()) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Reset all flags to defaults
   */
  resetToDefaults(): void {
    this.flags.clear();
    this.flags.set("useNewLedger", false);
    this.flags.set("enableAuditTrail", false);
    this.flags.set("useConflictResolver", false);
    this.flags.set("enableVisionStrategies", false);
    this.flags.set("enableAssumptiveBackfill", true);
    this.flags.set("enableStructuralOnlyEnhancements", true);
  }

  /**
   * Load flags from environment or storage
   */
  loadFromEnvironment(): void {
    // Check environment variables
    if (process.env.FEATURE_USE_NEW_LEDGER === "true") {
      this.setFlag("useNewLedger", true);
    }
    if (process.env.FEATURE_ENABLE_AUDIT_TRAIL === "true") {
      this.setFlag("enableAuditTrail", true);
    }
    if (process.env.FEATURE_USE_CONFLICT_RESOLVER === "true") {
      this.setFlag("useConflictResolver", true);
    }
    if (process.env.FEATURE_ENABLE_VISION_STRATEGIES === "true") {
      this.setFlag("enableVisionStrategies", true);
    }
    if (process.env.FEATURE_ENABLE_ASSUMPTIVE_BACKFILL === "true") {
      this.setFlag("enableAssumptiveBackfill", true);
    }
    if (process.env.FEATURE_ENABLE_STRUCTURAL_ONLY_ENHANCEMENTS === "true") {
      this.setFlag("enableStructuralOnlyEnhancements", true);
    }
  }
}

// Export singleton instance
export const featureFlags = FeatureFlags.getInstance();

// Convenience getters for common flags
export const useNewLedger = () => featureFlags.isEnabled("useNewLedger");
export const enableAuditTrail = () => featureFlags.isEnabled("enableAuditTrail");
export const useConflictResolver = () => featureFlags.isEnabled("useConflictResolver");
export const enableVisionStrategies = () => featureFlags.isEnabled("enableVisionStrategies");
export const enableAssumptiveBackfill = () => featureFlags.isEnabled("enableAssumptiveBackfill");
export const enableStructuralOnlyEnhancements = () => featureFlags.isEnabled("enableStructuralOnlyEnhancements");
