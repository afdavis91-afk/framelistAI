import { Inference, Decision, Flag, PipeCtx } from '../types';
import { BaseStrategy } from '../strategies/base/BaseStrategy';

export interface ConflictResolutionResult<T = any> {
  decision: Decision<T>;
  flags: Flag[];
  confidence: number;
  resolutionMethod: 'auto' | 'manual_review' | 'policy_violation';
}

export interface ConflictCandidate<T = any> {
  inference: Inference<T>;
  strategy: BaseStrategy<T>;
  sourceReliability: number;
  tiebreakerPriority: number;
}

export class ConflictResolver {
  /**
   * Resolve conflicts for a specific topic using policy-driven rules
   */
  resolveConflicts<T = any>(
    topic: string,
    inferences: Inference<T>[],
    strategies: BaseStrategy<T>[],
    ctx: PipeCtx
  ): ConflictResolutionResult<T> {
    try {
      // Filter inferences by topic and minimum confidence
      const validInferences = inferences.filter(inf => 
        inf.topic === topic && 
        inf.confidence >= ctx.getThreshold('acceptInference')
      );

      if (validInferences.length === 0) {
        return this.handleNoValidInferences<T>(topic, inferences, ctx);
      }

      if (validInferences.length === 1) {
        return this.handleSingleInference<T>(validInferences[0], ctx);
      }

      // Multiple inferences - need conflict resolution
      return this.resolveMultipleInferences<T>(validInferences, strategies, ctx);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Conflict resolution failed for topic ${topic}:`, errorMessage);
      
      return this.handleResolutionError<T>(topic, errorMessage, ctx);
    }
  }

  /**
   * Handle case where no inferences meet confidence threshold
   */
  private handleNoValidInferences<T>(
    topic: string,
    inferences: Inference<T>[],
    ctx: PipeCtx
  ): ConflictResolutionResult<T> {
    const flag: Flag = {
      id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: 'LOW_CONFIDENCE',
      severity: 'high',
      message: `No inferences for topic "${topic}" meet confidence threshold (${ctx.getThreshold('acceptInference')})`,
      topic,
      evidenceIds: inferences.flatMap(inf => inf.usedEvidence),
      assumptionIds: inferences.flatMap(inf => inf.usedAssumptions),
      inferenceIds: inferences.map(inf => inf.id),
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    ctx.ledger.addFlag(flag);

    // Create a decision with null value to indicate failure
    const decision: Decision<T> = {
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      topic,
      selectedValue: null as T,
      selectedInferenceId: '',
      competingInferences: inferences.map(inf => inf.id),
      justification: `No valid inferences available. Manual review required.`,
      policyUsed: {
        thresholds: { acceptInference: ctx.getThreshold('acceptInference') },
        tiebreakers: ctx.policy.tiebreakers,
        appliedRules: ['confidence_threshold'],
      },
      timestamp: new Date().toISOString(),
      stage: ctx.stage,
    };

    ctx.ledger.addDecision(decision);

    return {
      decision,
      flags: [flag],
      confidence: 0,
      resolutionMethod: 'policy_violation',
    };
  }

  /**
   * Handle case where only one inference is available
   */
  private handleSingleInference<T>(
    inference: Inference<T>,
    ctx: PipeCtx
  ): ConflictResolutionResult<T> {
    const decision: Decision<T> = {
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      topic: inference.topic,
      selectedValue: inference.value,
      selectedInferenceId: inference.id,
      competingInferences: [],
      justification: `Single high-confidence inference available (${Math.round(inference.confidence * 100)}%)`,
      policyUsed: {
        thresholds: { acceptInference: ctx.getThreshold('acceptInference') },
        tiebreakers: ctx.policy.tiebreakers,
        appliedRules: ['single_inference'],
      },
      timestamp: new Date().toISOString(),
      stage: ctx.stage,
    };

    ctx.ledger.addDecision(decision);

    return {
      decision,
      flags: [],
      confidence: inference.confidence,
      resolutionMethod: 'auto',
    };
  }

  /**
   * Resolve conflicts between multiple inferences
   */
  private resolveMultipleInferences<T>(
    inferences: Inference<T>[],
    strategies: BaseStrategy<T>[],
    ctx: PipeCtx
  ): ConflictResolutionResult<T> {
    // Create conflict candidates with strategy information
    const candidates: ConflictCandidate<T>[] = inferences.map(inference => {
      const strategy = strategies.find(s => s.method === inference.method);
      return {
        inference,
        strategy: strategy!,
        sourceReliability: strategy ? ctx.getSourceReliability(strategy.sourceType) : 0.5,
        tiebreakerPriority: strategy ? ctx.getTiebreakerPriority(strategy.sourceType) : 999,
      };
    });

    // Sort by confidence, then by source reliability, then by tiebreaker priority
    candidates.sort((a, b) => {
      // First by confidence (descending)
      if (Math.abs(a.inference.confidence - b.inference.confidence) > ctx.getThreshold('conflictGap')) {
        return b.inference.confidence - a.inference.confidence;
      }
      
      // Then by source reliability (descending)
      if (Math.abs(a.sourceReliability - b.sourceReliability) > 0.1) {
        return b.sourceReliability - a.sourceReliability;
      }
      
      // Finally by tiebreaker priority (ascending)
      return a.tiebreakerPriority - b.tiebreakerPriority;
    });

    const winner = candidates[0];
    const runnerUp = candidates[1];

    // Check if we can auto-resolve or need manual review
    const confidenceGap = winner.inference.confidence - runnerUp.inference.confidence;
    const canAutoResolve = confidenceGap >= ctx.getThreshold('conflictGap');

    if (canAutoResolve) {
      return this.autoResolveConflict<T>(winner, candidates, ctx);
    } else {
      return this.flagForManualReview<T>(candidates, confidenceGap, ctx);
    }
  }

  /**
   * Automatically resolve conflict using policy rules
   */
  private autoResolveConflict<T>(
    winner: ConflictCandidate<T>,
    allCandidates: ConflictCandidate<T>[],
    ctx: PipeCtx
  ): ConflictResolutionResult<T> {
    const decision: Decision<T> = {
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      topic: winner.inference.topic,
      selectedValue: winner.inference.value,
      selectedInferenceId: winner.inference.id,
      competingInferences: allCandidates.slice(1).map(c => c.inference.id),
      justification: `Auto-resolved using policy: ${winner.inference.method} selected over ${allCandidates.slice(1).map(c => c.inference.method).join(', ')}. Confidence gap: ${Math.round((winner.inference.confidence - allCandidates[1].inference.confidence) * 100)}%`,
      policyUsed: {
        thresholds: { 
          acceptInference: ctx.getThreshold('acceptInference'),
          conflictGap: ctx.getThreshold('conflictGap'),
        },
        tiebreakers: ctx.policy.tiebreakers,
        appliedRules: ['confidence_gap', 'source_reliability', 'tiebreaker_priority'],
      },
      timestamp: new Date().toISOString(),
      stage: ctx.stage,
    };

    ctx.ledger.addDecision(decision);

    // Add informational flag about auto-resolution
    const flag: Flag = {
      id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: 'CONFLICT',
      severity: 'low',
      message: `Conflict auto-resolved for topic "${winner.inference.topic}". ${winner.inference.method} selected with ${Math.round(winner.inference.confidence * 100)}% confidence.`,
      topic: winner.inference.topic,
      evidenceIds: winner.inference.usedEvidence,
      assumptionIds: winner.inference.usedAssumptions,
      inferenceIds: [winner.inference.id],
      decisionId: decision.id,
      timestamp: new Date().toISOString(),
      resolved: true,
    };

    ctx.ledger.addFlag(flag);

    return {
      decision,
      flags: [flag],
      confidence: winner.inference.confidence,
      resolutionMethod: 'auto',
    };
  }

  /**
   * Flag conflict for manual review
   */
  private flagForManualReview<T>(
    candidates: ConflictCandidate<T>[],
    confidenceGap: number,
    ctx: PipeCtx
  ): ConflictResolutionResult<T> {
    // Create flag for manual review
    const flag: Flag = {
      id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: 'CONFLICT',
      severity: 'medium',
      message: `Conflict requires manual review for topic "${candidates[0].inference.topic}". Confidence gap (${Math.round(confidenceGap * 100)}%) below threshold (${Math.round(ctx.getThreshold('conflictGap') * 100)}%).`,
      topic: candidates[0].inference.topic,
      evidenceIds: candidates.flatMap(c => c.inference.usedEvidence),
      assumptionIds: candidates.flatMap(c => c.inference.usedAssumptions),
      inferenceIds: candidates.map(c => c.inference.id),
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    ctx.ledger.addFlag(flag);

    // Create decision with highest confidence inference as temporary selection
    const winner = candidates[0];
    const decision: Decision<T> = {
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      topic: winner.inference.topic,
      selectedValue: winner.inference.value,
      selectedInferenceId: winner.inference.id,
      competingInferences: candidates.slice(1).map(c => c.inference.id),
      justification: `Temporary selection pending manual review. ${winner.inference.method} selected with highest confidence (${Math.round(winner.inference.confidence * 100)}%) but gap below threshold.`,
      policyUsed: {
        thresholds: { 
          acceptInference: ctx.getThreshold('acceptInference'),
          conflictGap: ctx.getThreshold('conflictGap'),
        },
        tiebreakers: ctx.policy.tiebreakers,
        appliedRules: ['temporary_selection', 'manual_review_required'],
      },
      timestamp: new Date().toISOString(),
      stage: ctx.stage,
    };

    ctx.ledger.addDecision(decision);

    return {
      decision,
      flags: [flag],
      confidence: winner.inference.confidence * 0.8, // Reduce confidence due to conflict
      resolutionMethod: 'manual_review',
    };
  }

  /**
   * Handle resolution errors
   */
  private handleResolutionError<T>(
    topic: string,
    errorMessage: string,
    ctx: PipeCtx
  ): ConflictResolutionResult<T> {
    const flag: Flag = {
      id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: 'POLICY_VIOLATION',
      severity: 'critical',
      message: `Conflict resolution failed for topic "${topic}": ${errorMessage}`,
      topic,
      evidenceIds: [],
      assumptionIds: [],
      inferenceIds: [],
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    ctx.ledger.addFlag(flag);

    // Create error decision
    const decision: Decision<T> = {
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      topic,
      selectedValue: null as T,
      selectedInferenceId: '',
      competingInferences: [],
      justification: `Resolution failed due to error: ${errorMessage}`,
      policyUsed: {
        thresholds: {},
        tiebreakers: [],
        appliedRules: ['error_fallback'],
      },
      timestamp: new Date().toISOString(),
      stage: ctx.stage,
    };

    ctx.ledger.addDecision(decision);

    return {
      decision,
      flags: [flag],
      confidence: 0,
      resolutionMethod: 'policy_violation',
    };
  }
}
