import { Stage, PipeCtx, Inference } from '../types';
import { AssumptionSeedingOutput } from './AssumptionSeeding';
import { BaseStrategy, StrategyContext } from '../strategies/base/BaseStrategy';
import { JoistScheduleStrategy } from '../strategies/joist/JoistScheduleStrategy';

export interface MultiStrategyInferenceInput extends AssumptionSeedingOutput {
  evidence: any[];
}

export interface MultiStrategyInferenceOutput {
  inferences: Inference<any>[];
  totalInferences: number;
  topics: string[];
}

export class MultiStrategyInferenceStage implements Stage<MultiStrategyInferenceInput, MultiStrategyInferenceOutput> {
  public readonly name = 'MultiStrategyInference';

  private strategies: BaseStrategy<any>[] = [];

  constructor() {
    // Initialize available strategies
    this.strategies = [
      new JoistScheduleStrategy(),
      // Add more strategies here as they're implemented
    ];
  }

  async execute(input: MultiStrategyInferenceInput, ctx: PipeCtx): Promise<MultiStrategyInferenceOutput> {
    ctx.logStageEntry(this.name);
    
    try {
      const inferences: Inference<any>[] = [];
      const topics = new Set<string>();

      // Get available evidence and assumptions from the ledger
      const availableEvidence = ctx.ledger.evidence;
      const availableAssumptions = ctx.ledger.assumptions;

      // Execute strategies for each topic
      for (const strategy of this.strategies) {
        try {
          const topic = strategy.topic;
          topics.add(topic);

          // Create strategy context
          const strategyContext: StrategyContext = {
            documentId: ctx.getStageData('document')?.id || 'unknown',
            pageNumber: 1, // This could be enhanced to handle multiple pages
            topic,
            availableEvidence,
            availableAssumptions,
          };

          // Check if strategy can handle this context
          if (strategy.canHandle(strategyContext)) {
            // Execute strategy
            const result = await strategy.execute(strategyContext, ctx);
            
            if (result.success && result.value) {
              // Create inference from strategy result
              const inference = strategy.createInference(result, strategyContext, ctx);
              
              // Add inference to ledger
              ctx.ledger.addInference(inference);
              inferences.push(inference);
              
              console.log(`Strategy ${strategy.name} generated inference for topic ${topic} with confidence ${Math.round(result.confidence * 100)}%`);
            } else {
              console.log(`Strategy ${strategy.name} failed for topic ${topic}: ${result.error}`);
            }
          } else {
            console.log(`Strategy ${strategy.name} cannot handle context for topic ${topic}`);
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Strategy ${strategy.name} execution failed:`, errorMessage);
          
          // Add error flag to ledger
          ctx.ledger.addFlag({
            id: `flag_strategy_error_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            type: 'POLICY_VIOLATION',
            severity: 'medium',
            message: `Strategy ${strategy.name} failed for topic ${strategy.topic}: ${errorMessage}`,
            topic: strategy.topic,
            evidenceIds: [],
            assumptionIds: [],
            inferenceIds: [],
            timestamp: new Date().toISOString(),
            resolved: false,
          });
        }
      }

      // Generate additional inferences from evidence patterns
      const patternInferences = this.generatePatternInferences(availableEvidence, availableAssumptions, ctx);
      inferences.push(...patternInferences);

      const output: MultiStrategyInferenceOutput = {
        inferences,
        totalInferences: inferences.length,
        topics: Array.from(topics),
      };

      ctx.logStageExit(this.name, true);
      return output;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Multi-strategy inference failed:`, errorMessage);
      
      ctx.logStageExit(this.name, false);
      throw error;
    }
  }

  /**
   * Generate inferences from evidence patterns and assumptions
   */
  private generatePatternInferences(
    evidence: any[],
    assumptions: any[],
    ctx: PipeCtx
  ): Inference<any>[] {
    const inferences: Inference<any>[] = [];

    try {
      // Generate wall type inferences from evidence patterns
      const wallInferences = this.generateWallTypeInferences(evidence, assumptions, ctx);
      inferences.push(...wallInferences);

      // Generate header inferences from evidence patterns
      const headerInferences = this.generateHeaderInferences(evidence, assumptions, ctx);
      inferences.push(...headerInferences);

      // Generate sheathing inferences from evidence patterns
      const sheathingInferences = this.generateSheathingInferences(evidence, assumptions, ctx);
      inferences.push(...sheathingInferences);

    } catch (error) {
      console.warn('Failed to generate pattern inferences:', error);
    }

    return inferences;
  }

  /**
   * Generate wall type inferences from evidence patterns
   */
  private generateWallTypeInferences(
    evidence: any[],
    assumptions: any[],
    ctx: PipeCtx
  ): Inference<any>[] {
    const inferences: Inference<any>[] = [];

    try {
      // Look for wall type patterns in evidence
      const wallEvidence = evidence.filter(ev => 
        ev.type === 'symbol' && ev.content.symbolType === 'wall_symbol'
      );

      if (wallEvidence.length > 0) {
        // Get wall type assumption if available
        const wallTypeAssumption = assumptions.find(a => a.key === 'wall_type');
        
        if (wallTypeAssumption) {
          const inference: Inference<any> = {
            id: `inf_pattern_wall_type_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            topic: 'wall_type_pattern',
            value: {
              wallType: wallTypeAssumption.value,
              source: 'pattern_analysis',
            },
            confidence: 0.7,
            method: 'fromEvidencePatterns',
            usedEvidence: wallEvidence.map(ev => ev.id),
            usedAssumptions: [wallTypeAssumption.id],
            explanation: `Wall type inferred from evidence patterns and assumptions`,
            alternatives: [],
            timestamp: new Date().toISOString(),
            stage: ctx.stage,
          };

          ctx.ledger.addInference(inference);
          inferences.push(inference);
        }
      }

    } catch (error) {
      console.warn('Failed to generate wall type inferences:', error);
    }

    return inferences;
  }

  /**
   * Generate header inferences from evidence patterns
   */
  private generateHeaderInferences(
    evidence: any[],
    assumptions: any[],
    ctx: PipeCtx
  ): Inference<any>[] {
    const inferences: Inference<any>[] = [];

    try {
      // Look for opening patterns that might indicate header requirements
      const openingEvidence = evidence.filter(ev => 
        ev.type === 'symbol' && ev.content.symbolType === 'opening_symbol'
      );

      if (openingEvidence.length > 0) {
        // Get header bearing length assumption
        const bearingAssumption = assumptions.find(a => a.key === 'header_bearing_length');
        
        if (bearingAssumption) {
          const inference: Inference<any> = {
            id: `inf_pattern_header_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            topic: 'header_requirements',
            value: {
              bearingLength: bearingAssumption.value,
              source: 'pattern_analysis',
            },
            confidence: 0.6,
            method: 'fromEvidencePatterns',
            usedEvidence: openingEvidence.map(ev => ev.id),
            usedAssumptions: [bearingAssumption.id],
            explanation: `Header requirements inferred from opening patterns and bearing length assumptions`,
            alternatives: [],
            timestamp: new Date().toISOString(),
            stage: ctx.stage,
          };

          ctx.ledger.addInference(inference);
          inferences.push(inference);
        }
      }

    } catch (error) {
      console.warn('Failed to generate header inferences:', error);
    }

    return inferences;
  }

  /**
   * Generate sheathing inferences from evidence patterns
   */
  private generateSheathingInferences(
    evidence: any[],
    assumptions: any[],
    ctx: PipeCtx
  ): Inference<any>[] {
    const inferences: Inference<any>[] = [];

    try {
      // Look for sheathing-related evidence
      const sheathingEvidence = evidence.filter(ev => 
        ev.type === 'text' && ev.content.text.toLowerCase().includes('sheathing')
      );

      if (sheathingEvidence.length > 0) {
        // Get sheathing nailing assumptions
        const edgeSpacingAssumption = assumptions.find(a => a.key === 'sheathing_edge_spacing');
        const fieldSpacingAssumption = assumptions.find(a => a.key === 'sheathing_field_spacing');
        
        if (edgeSpacingAssumption && fieldSpacingAssumption) {
          const inference: Inference<any> = {
            id: `inf_pattern_sheathing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            topic: 'sheathing_nailing',
            value: {
              edgeSpacing: edgeSpacingAssumption.value,
              fieldSpacing: fieldSpacingAssumption.value,
              source: 'pattern_analysis',
            },
            confidence: 0.65,
            method: 'fromEvidencePatterns',
            usedEvidence: sheathingEvidence.map(ev => ev.id),
            usedAssumptions: [edgeSpacingAssumption.id, fieldSpacingAssumption.id],
            explanation: `Sheathing nailing pattern inferred from evidence patterns and assumptions`,
            alternatives: [],
            timestamp: new Date().toISOString(),
            stage: ctx.stage,
          };

          ctx.ledger.addInference(inference);
          inferences.push(inference);
        }
      }

    } catch (error) {
      console.warn('Failed to generate sheathing inferences:', error);
    }

    return inferences;
  }

  /**
   * Add a new strategy to the stage
   */
  addStrategy(strategy: BaseStrategy<any>): void {
    this.strategies.push(strategy);
  }

  /**
   * Get all available strategies
   */
  getStrategies(): BaseStrategy<any>[] {
    return [...this.strategies];
  }

  validateInput(input: MultiStrategyInferenceInput): boolean {
    return !!(input.evidence && Array.isArray(input.evidence) && input.assumptions && Array.isArray(input.assumptions));
  }

  validateOutput(output: MultiStrategyInferenceOutput): boolean {
    return !!(output.inferences && Array.isArray(output.inferences) && output.topics && Array.isArray(output.topics));
  }
}
