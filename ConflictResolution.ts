import { Stage, PipeCtx, Decision, Flag } from '../types';
import { MultiStrategyInferenceOutput } from './MultiStrategyInference';
import { ConflictResolver, ConflictResolutionResult } from '../conflict/ConflictResolver';
import { BaseStrategy } from '../strategies/base/BaseStrategy';

export interface ConflictResolutionInput extends MultiStrategyInferenceOutput {}

export interface ConflictResolutionOutput {
  decisions: Decision<any>[];
  flags: Flag[];
  totalDecisions: number;
  totalFlags: number;
  resolutionSummary: {
    autoResolved: number;
    manualReview: number;
    policyViolations: number;
  };
}

export class ConflictResolutionStage implements Stage<ConflictResolutionInput, ConflictResolutionOutput> {
  public readonly name = 'ConflictResolution';
  private conflictResolver: ConflictResolver;

  constructor() {
    this.conflictResolver = new ConflictResolver();
  }

  async execute(input: ConflictResolutionInput, ctx: PipeCtx): Promise<ConflictResolutionOutput> {
    ctx.logStageEntry(this.name);
    
    try {
      const decisions: Decision<any>[] = [];
      const flags: Flag[] = [];
      const resolutionSummary = {
        autoResolved: 0,
        manualReview: 0,
        policyViolations: 0,
      };

      // Get available strategies from the context
      const strategies = ctx.getStageData('strategies') || [];

      // Group inferences by topic
      const inferencesByTopic = this.groupInferencesByTopic(input.inferences);

      // Resolve conflicts for each topic
      for (const [topic, inferences] of Object.entries(inferencesByTopic)) {
        try {
          console.log(`Resolving conflicts for topic: ${topic} (${inferences.length} inferences)`);

          // Resolve conflicts using the ConflictResolver
          const resolution = this.conflictResolver.resolveConflicts(
            topic,
            inferences,
            strategies,
            ctx
          );

          // Add decision to ledger and collect
          decisions.push(resolution.decision);
          flags.push(...resolution.flags);

          // Update resolution summary
          switch (resolution.resolutionMethod) {
            case 'auto':
              resolutionSummary.autoResolved++;
              break;
            case 'manual_review':
              resolutionSummary.manualReview++;
              break;
            case 'policy_violation':
              resolutionSummary.policyViolations++;
              break;
          }

          console.log(`Topic ${topic} resolved with method: ${resolution.resolutionMethod}`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Conflict resolution failed for topic ${topic}:`, errorMessage);
          
          // Add error flag
          const errorFlag: Flag = {
            id: `flag_resolution_error_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            type: 'POLICY_VIOLATION',
            severity: 'critical',
            message: `Conflict resolution failed for topic "${topic}": ${errorMessage}`,
            topic,
            evidenceIds: [],
            assumptionIds: [],
            inferenceIds: inferences.map(inf => inf.id),
            timestamp: new Date().toISOString(),
            resolved: false,
          };

          ctx.ledger.addFlag(errorFlag);
          flags.push(errorFlag);
          resolutionSummary.policyViolations++;
        }
      }

      // Add all decisions to the ledger
      for (const decision of decisions) {
        ctx.ledger.addDecision(decision);
      }

      // Add all flags to the ledger
      for (const flag of flags) {
        ctx.ledger.addFlag(flag);
      }

      const output: ConflictResolutionOutput = {
        decisions,
        flags,
        totalDecisions: decisions.length,
        totalFlags: flags.length,
        resolutionSummary,
      };

      // Log resolution summary
      console.log('Conflict resolution summary:', resolutionSummary);

      ctx.logStageExit(this.name, true);
      return output;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Conflict resolution stage failed:`, errorMessage);
      
      ctx.logStageExit(this.name, false);
      throw error;
    }
  }

  /**
   * Group inferences by topic for conflict resolution
   */
  private groupInferencesByTopic(inferences: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const inference of inferences) {
      const topic = inference.topic;
      if (!grouped[topic]) {
        grouped[topic] = [];
      }
      grouped[topic].push(inference);
    }

    return grouped;
  }

  /**
   * Validate that all decisions are properly linked to inferences
   */
  private validateDecisions(decisions: Decision<any>[], inferences: any[]): string[] {
    const errors: string[] = [];
    const inferenceIds = new Set(inferences.map(inf => inf.id));

    for (const decision of decisions) {
      // Check if selected inference exists
      if (decision.selectedInferenceId && !inferenceIds.has(decision.selectedInferenceId)) {
        errors.push(`Decision ${decision.id} references non-existent inference ${decision.selectedInferenceId}`);
      }

      // Check if competing inferences exist
      for (const competingId of decision.competingInferences) {
        if (!inferenceIds.has(competingId)) {
          errors.push(`Decision ${decision.id} references non-existent competing inference ${competingId}`);
        }
      }
    }

    return errors;
  }

  /**
   * Generate a summary report of the conflict resolution process
   */
  private generateResolutionReport(
    decisions: Decision<any>[],
    flags: Flag[],
    resolutionSummary: any
  ): string {
    const report = [
      '=== Conflict Resolution Report ===',
      `Total Decisions: ${decisions.length}`,
      `Total Flags: ${flags.length}`,
      '',
      'Resolution Methods:',
      `  Auto-resolved: ${resolutionSummary.autoResolved}`,
      `  Manual review required: ${resolutionSummary.manualReview}`,
      `  Policy violations: ${resolutionSummary.policyViolations}`,
      '',
      'Topics with Decisions:',
      ...Array.from(new Set(decisions.map(d => d.topic))).map(topic => `  - ${topic}`),
      '',
      'Flags by Severity:',
      ...['critical', 'high', 'medium', 'low'].map(severity => {
        const count = flags.filter(f => f.severity === severity).length;
        return `  ${severity}: ${count}`;
      }),
    ];

    return report.join('\n');
  }

  validateInput(input: ConflictResolutionInput): boolean {
    return !!(input.inferences && Array.isArray(input.inferences) && input.topics && Array.isArray(input.topics));
  }

  validateOutput(output: ConflictResolutionOutput): boolean {
    return !!(
      output.decisions && Array.isArray(output.decisions) &&
      output.flags && Array.isArray(output.flags) &&
      typeof output.totalDecisions === 'number' &&
      typeof output.totalFlags === 'number'
    );
  }
}
