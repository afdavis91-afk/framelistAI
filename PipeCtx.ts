import { InferenceLedger, Policy, PipeCtx as IPipeCtx } from './types';

export class PipeCtx implements IPipeCtx {
  public ledger: InferenceLedger;
  public policy: Policy;
  public stage: string;
  public stageData: Record<string, any>;
  public metadata: {
    traceId: string;
    scenarioId?: string;
    userId?: string;
  };

  constructor(ledger: InferenceLedger, policy: Policy, stage: string, traceId: string) {
    this.ledger = ledger;
    this.policy = policy;
    this.stage = stage;
    this.stageData = {};
    this.metadata = {
      traceId,
      scenarioId: undefined,
      userId: undefined,
    };
  }

  /**
   * Set stage-specific data
   */
  setStageData(key: string, value: any): void {
    this.stageData[key] = value;
  }

  /**
   * Get stage-specific data
   */
  getStageData(key: string): any {
    return this.stageData[key];
  }

  /**
   * Set scenario ID for this pipeline run
   */
  setScenarioId(scenarioId: string): void {
    this.metadata.scenarioId = scenarioId;
  }

  /**
   * Set user ID for this pipeline run
   */
  setUserId(userId: string): void {
    this.metadata.userId = userId;
  }

  /**
   * Create a new context for a child stage
   */
  createChildContext(stage: string): PipeCtx {
    const childCtx = new PipeCtx(this.ledger, this.policy, stage, this.metadata.traceId);
    childCtx.metadata.scenarioId = this.metadata.scenarioId;
    childCtx.metadata.userId = this.metadata.userId;
    
    // Copy relevant stage data
    for (const [key, value] of Object.entries(this.stageData)) {
      if (key.startsWith('shared_') || key === 'document' || key === 'projectInfo') {
        childCtx.setStageData(key, value);
      }
    }
    
    return childCtx;
  }

  /**
   * Get current stage progress
   */
  getStageProgress(): { current: number; total: number; success: number } {
    return {
      current: this.ledger.metadata.totalStages,
      total: this.ledger.metadata.totalStages,
      success: this.ledger.metadata.successStages,
    };
  }

  /**
   * Update stage progress
   */
  updateStageProgress(totalStages: number, successStages: number): void {
    this.ledger.updateStageProgress(totalStages, successStages);
  }

  /**
   * Log stage entry
   */
  logStageEntry(stageName: string): void {
    console.log(`[${this.metadata.traceId}] Entering stage: ${stageName}`);
    this.setStageData('stageStartTime', Date.now());
  }

  /**
   * Log stage exit
   */
  logStageExit(stageName: string, success: boolean): void {
    const startTime = this.getStageData('stageStartTime');
    const duration = startTime ? Date.now() - startTime : 0;
    
    console.log(`[${this.metadata.traceId}] Exiting stage: ${stageName} (${success ? 'SUCCESS' : 'FAILED'}) in ${duration}ms`);
    
    if (success) {
      this.ledger.metadata.successStages++;
    }
    
    this.ledger.metadata.totalStages++;
  }

  /**
   * Get context summary for logging
   */
  getContextSummary(): {
    traceId: string;
    stage: string;
    scenarioId?: string;
    userId?: string;
    ledgerId: string;
    policyId: string;
  } {
    return {
      traceId: this.metadata.traceId,
      stage: this.stage,
      scenarioId: this.metadata.scenarioId,
      userId: this.metadata.userId,
      ledgerId: this.ledger.id,
      policyId: this.policy.id,
    };
  }

  /**
   * Check if a feature flag is enabled
   */
  isFeatureEnabled(featureName: string): boolean {
    // For now, use environment variables or default to true
    // This can be enhanced with a proper feature flag system
    const envValue = process.env[`FEATURE_${featureName.toUpperCase()}`];
    if (envValue !== undefined) {
      return envValue === 'true' || envValue === '1';
    }
    
    // Default feature flags for the pipeline
    const defaultFlags: Record<string, boolean> = {
      useNewLedger: true,
      useConflictResolver: true,
      enableVisionStrategies: true,
      enableAuditTrail: true,
    };
    
    return defaultFlags[featureName] ?? true;
  }

  /**
   * Get policy threshold value
   */
  getThreshold(key: keyof Policy['thresholds']): number {
    return this.policy.thresholds[key];
  }

  /**
   * Get source reliability weight
   */
  getSourceReliability(sourceType: string): number {
    return this.policy.priors.sourceReliability[sourceType] ?? 0.5;
  }

  /**
   * Get tiebreaker priority for a source type
   */
  getTiebreakerPriority(sourceType: string): number {
    const index = this.policy.tiebreakers.indexOf(sourceType);
    return index >= 0 ? index : this.policy.tiebreakers.length;
  }

  /**
   * Check if extraction is enabled for a feature
   */
  isExtractionEnabled(feature: keyof Policy['extraction']): boolean {
    if (feature === 'enableGeometry') {
      return this.policy.extraction.enableGeometry;
    }
    return true; // Other extraction features are always enabled
  }

  /**
   * Get pricing configuration
   */
  getPricingConfig(): Policy['pricing'] {
    return this.policy.pricing;
  }

  /**
   * Create a trace event for observability
   */
  createTraceEvent(type: string, data?: Record<string, any>): {
    type: string;
    timestamp: string;
    traceId: string;
    stage: string;
    data?: Record<string, any>;
  } {
    return {
      type,
      timestamp: new Date().toISOString(),
      traceId: this.metadata.traceId,
      stage: this.stage,
      data,
    };
  }
}
