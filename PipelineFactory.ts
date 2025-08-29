import { Pipeline, PipelineConfig } from './Pipeline';
import { EvidenceCollectionStage } from './stages/EvidenceCollection';
import { AssumptionSeedingStage } from './stages/AssumptionSeeding';
import { MultiStrategyInferenceStage } from './stages/MultiStrategyInference';
import { ConflictResolutionStage } from './stages/ConflictResolution';
import { ProjectDocument } from '../types/construction';

export interface PDFAnalysisPipelineConfig extends PipelineConfig {
  enableVisionStrategies?: boolean;
  enableAuditTrail?: boolean;
  maxEvidenceCollection?: number;
  maxAssumptionSeeding?: number;
  maxInferenceGeneration?: number;
  maxConflictResolution?: number;
}

export interface PDFAnalysisPipelineInput {
  document: ProjectDocument;
  projectDocuments?: ProjectDocument[];
}

export interface PDFAnalysisPipelineOutput {
  evidence: any[];
  assumptions: any[];
  inferences: any[];
  decisions: any[];
  flags: any[];
  ledger: any;
  summary: {
    totalEvidence: number;
    totalAssumptions: number;
    totalInferences: number;
    totalDecisions: number;
    totalFlags: number;
    averageConfidence: number;
  };
}

export class PDFAnalysisPipelineFactory {
  /**
   * Create a complete PDF analysis pipeline
   */
  static createPipeline(config: PDFAnalysisPipelineConfig = {}): Pipeline<PDFAnalysisPipelineInput, PDFAnalysisPipelineOutput> {
    const pipeline = new Pipeline<PDFAnalysisPipelineInput, PDFAnalysisPipelineOutput>(config);

    // Stage 1: Evidence Collection
    const evidenceCollectionStage = new EvidenceCollectionStage();
    pipeline.addStage(evidenceCollectionStage);

    // Stage 2: Assumption Seeding
    const assumptionSeedingStage = new AssumptionSeedingStage();
    pipeline.addStage(assumptionSeedingStage);

    // Stage 3: Multi-Strategy Inference
    const multiStrategyInferenceStage = new MultiStrategyInferenceStage();
    pipeline.addStage(multiStrategyInferenceStage);

    // Stage 4: Conflict Resolution
    const conflictResolutionStage = new ConflictResolutionStage();
    pipeline.addStage(conflictResolutionStage);

    // Stage 5: Material Line Creation (placeholder for future implementation)
    // const materialLineCreationStage = new MaterialLineCreationStage();
    // pipeline.addStage(materialLineCreationStage);

    return pipeline;
  }

  /**
   * Create a pipeline with custom stages
   */
  static createCustomPipeline(
    stages: any[],
    config: PDFAnalysisPipelineConfig = {}
  ): Pipeline<PDFAnalysisPipelineInput, PDFAnalysisPipelineOutput> {
    const pipeline = new Pipeline<PDFAnalysisPipelineInput, PDFAnalysisPipelineOutput>(config);
    
    for (const stage of stages) {
      pipeline.addStage(stage);
    }
    
    return pipeline;
  }

  /**
   * Create a minimal pipeline for testing
   */
  static createTestPipeline(config: PDFAnalysisPipelineConfig = {}): Pipeline<PDFAnalysisPipelineInput, PDFAnalysisPipelineOutput> {
    const pipeline = new Pipeline<PDFAnalysisPipelineInput, PDFAnalysisPipelineOutput>({
      ...config,
      policyId: 'test',
      maxRetries: 1,
      timeoutMs: 60000, // 1 minute for testing
    });

    // Only include essential stages for testing
    const evidenceCollectionStage = new EvidenceCollectionStage();
    pipeline.addStage(evidenceCollectionStage);

    const assumptionSeedingStage = new AssumptionSeedingStage();
    pipeline.addStage(assumptionSeedingStage);

    return pipeline;
  }

  /**
   * Create a pipeline optimized for specific document types
   */
  static createDocumentTypePipeline(
    documentType: string,
    config: PDFAnalysisPipelineConfig = {}
  ): Pipeline<PDFAnalysisPipelineInput, PDFAnalysisPipelineOutput> {
    const pipeline = new Pipeline<PDFAnalysisPipelineInput, PDFAnalysisPipelineOutput>(config);

    // Always include evidence collection and assumption seeding
    const evidenceCollectionStage = new EvidenceCollectionStage();
    pipeline.addStage(evidenceCollectionStage);

    const assumptionSeedingStage = new AssumptionSeedingStage();
    pipeline.addStage(assumptionSeedingStage);

    // Add type-specific stages
    switch (documentType.toLowerCase()) {
      case 'structural':
        // Structural documents benefit from full pipeline
        const multiStrategyInferenceStage = new MultiStrategyInferenceStage();
        pipeline.addStage(multiStrategyInferenceStage);

        const conflictResolutionStage = new ConflictResolutionStage();
        pipeline.addStage(conflictResolutionStage);
        break;

      case 'architectural':
        // Architectural documents may need different strategies
        const architecturalInferenceStage = new MultiStrategyInferenceStage();
        pipeline.addStage(architecturalInferenceStage);

        const architecturalConflictStage = new ConflictResolutionStage();
        pipeline.addStage(architecturalConflictStage);
        break;

      case 'specifications':
        // Specification documents may need text-focused analysis
        const specInferenceStage = new MultiStrategyInferenceStage();
        pipeline.addStage(specInferenceStage);

        const specConflictStage = new ConflictResolutionStage();
        pipeline.addStage(specConflictStage);
        break;

      default:
        // Default to full pipeline
        const defaultInferenceStage = new MultiStrategyInferenceStage();
        pipeline.addStage(defaultInferenceStage);

        const defaultConflictStage = new ConflictResolutionStage();
        pipeline.addStage(defaultConflictStage);
        break;
    }

    return pipeline;
  }

  /**
   * Get default pipeline configuration
   */
  static getDefaultConfig(): PDFAnalysisPipelineConfig {
    return {
      policyId: 'default',
      enableVisionStrategies: true,
      enableAuditTrail: true,
      maxEvidenceCollection: 100,
      maxAssumptionSeeding: 50,
      maxInferenceGeneration: 200,
      maxConflictResolution: 100,
      maxRetries: 3,
      timeoutMs: 300000, // 5 minutes
    };
  }

  /**
   * Validate pipeline configuration
   */
  static validateConfig(config: PDFAnalysisPipelineConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.maxRetries && (config.maxRetries < 1 || config.maxRetries > 10)) {
      errors.push('maxRetries must be between 1 and 10');
    }

    if (config.timeoutMs && (config.timeoutMs < 30000 || config.timeoutMs > 900000)) {
      errors.push('timeoutMs must be between 30 seconds and 15 minutes');
    }

    if (config.maxEvidenceCollection && config.maxEvidenceCollection < 1) {
      errors.push('maxEvidenceCollection must be at least 1');
    }

    if (config.maxAssumptionSeeding && config.maxAssumptionSeeding < 1) {
      errors.push('maxAssumptionSeeding must be at least 1');
    }

    if (config.maxInferenceGeneration && config.maxInferenceGeneration < 1) {
      errors.push('maxInferenceGeneration must be at least 1');
    }

    if (config.maxConflictResolution && config.maxConflictResolution < 1) {
      errors.push('maxConflictResolution must be at least 1');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
