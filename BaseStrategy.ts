import { Evidence, Assumption, Inference, PipeCtx } from '../../types';

export interface StrategyResult<T = any> {
  success: boolean;
  value?: T;
  confidence: number;
  explanation: string;
  usedEvidence: string[];
  usedAssumptions: string[];
  alternatives: Array<{value: T, confidence: number, reason: string}>;
  error?: string;
}

export interface StrategyContext {
  documentId: string;
  pageNumber: number;
  topic: string;
  availableEvidence: Evidence[];
  availableAssumptions: Assumption[];
}

export abstract class BaseStrategy<T = any> {
  public abstract readonly name: string;
  public abstract readonly topic: string;
  public abstract readonly method: string;
  public abstract readonly sourceType: string;

  /**
   * Check if this strategy can handle the given context
   */
  abstract canHandle(context: StrategyContext): boolean;

  /**
   * Execute the strategy and return results
   */
  abstract execute(context: StrategyContext, ctx: PipeCtx): Promise<StrategyResult<T>>;

  /**
   * Get the priority of this strategy (lower numbers = higher priority)
   */
  getPriority(): number {
    const priorities: Record<string, number> = {
      'schedule_table': 1,
      'explicit_note': 2,
      'plan_symbol': 3,
      'vision_llm': 4,
      'assumed_default': 5,
    };
    return priorities[this.sourceType] || 5;
  }

  /**
   * Get the source reliability weight for this strategy
   */
  getSourceReliability(ctx: PipeCtx): number {
    return ctx.getSourceReliability(this.sourceType);
  }

  /**
   * Get the tiebreaker priority for this strategy
   */
  getTiebreakerPriority(ctx: PipeCtx): number {
    return ctx.getTiebreakerPriority(this.sourceType);
  }

  /**
   * Create an inference from strategy results
   */
  protected createInference(
    result: StrategyResult<T>,
    context: StrategyContext,
    ctx: PipeCtx
  ): Inference<T> {
    return {
      id: `inf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      topic: this.topic,
      value: result.value!,
      confidence: result.confidence,
      method: this.method,
      usedEvidence: result.usedEvidence,
      usedAssumptions: result.usedAssumptions,
      explanation: result.explanation,
      alternatives: result.alternatives,
      timestamp: new Date().toISOString(),
      stage: ctx.stage,
    };
  }

  /**
   * Validate that required evidence exists
   */
  protected validateRequiredEvidence(
    evidenceIds: string[],
    availableEvidence: Evidence[]
  ): boolean {
    const availableIds = new Set(availableEvidence.map(e => e.id));
    return evidenceIds.every(id => availableIds.has(id));
  }

  /**
   * Validate that required assumptions exist
   */
  protected validateRequiredAssumptions(
    assumptionIds: string[],
    availableAssumptions: Assumption[]
  ): boolean {
    const availableIds = new Set(availableAssumptions.map(a => a.id));
    return assumptionIds.every(id => availableIds.has(id));
  }

  /**
   * Find evidence by type
   */
  protected findEvidenceByType(
    type: Evidence['type'],
    availableEvidence: Evidence[]
  ): Evidence[] {
    return availableEvidence.filter(e => e.type === type);
  }

  /**
   * Find assumptions by key
   */
  protected findAssumptionsByKey(
    key: string,
    availableAssumptions: Assumption[]
  ): Assumption[] {
    return availableAssumptions.filter(a => a.key === key);
  }

  /**
   * Get the best assumption for a key (highest confidence)
   */
  protected getBestAssumption(
    key: string,
    availableAssumptions: Assumption[]
  ): Assumption | undefined {
    const assumptions = this.findAssumptionsByKey(key, availableAssumptions);
    if (assumptions.length === 0) return undefined;
    
    return assumptions.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }

  /**
   * Calculate confidence based on evidence quality and assumption reliability
   */
  protected calculateConfidence(
    evidenceQuality: number,
    assumptionReliability: number,
    baseConfidence: number = 0.8
  ): number {
    // Weight evidence quality more heavily than assumption reliability
    const weightedConfidence = (evidenceQuality * 0.7) + (assumptionReliability * 0.3);
    return Math.min(baseConfidence * weightedConfidence, 1.0);
  }

  /**
   * Create a success result
   */
  protected createSuccessResult(
    value: T,
    confidence: number,
    explanation: string,
    usedEvidence: string[],
    usedAssumptions: string[],
    alternatives: Array<{value: T, confidence: number, reason: string}> = []
  ): StrategyResult<T> {
    return {
      success: true,
      value,
      confidence,
      explanation,
      usedEvidence,
      usedAssumptions,
      alternatives,
    };
  }

  /**
   * Create a failure result
   */
  protected createFailureResult(
    error: string,
    explanation: string,
    usedEvidence: string[] = [],
    usedAssumptions: string[] = []
  ): StrategyResult<T> {
    return {
      success: false,
      confidence: 0,
      explanation,
      usedEvidence,
      usedAssumptions,
      alternatives: [],
      error,
    };
  }

  /**
   * Log strategy execution for debugging
   */
  protected logExecution(
    context: StrategyContext,
    result: StrategyResult<T>,
    ctx: PipeCtx
  ): void {
    const summary = ctx.getContextSummary();
    console.log(`[${summary.traceId}] Strategy ${this.name} executed:`, {
      topic: this.topic,
      method: this.method,
      success: result.success,
      confidence: result.confidence,
      evidenceCount: result.usedEvidence.length,
      assumptionCount: result.usedAssumptions.length,
    });
  }
}
