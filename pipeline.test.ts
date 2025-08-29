import { PDFAnalysisPipelineFactory } from '../PipelineFactory';
import { policyManager } from '../PolicyManager';

describe('PDF Analysis Pipeline', () => {
  let pipeline: any;

  beforeEach(() => {
    pipeline = PDFAnalysisPipelineFactory.createTestPipeline();
  });

  afterEach(() => {
    if (pipeline) {
      pipeline.clearStages();
    }
  });

  test('should create pipeline with correct stages', () => {
    const stages = pipeline.getStages();
    expect(stages.length).toBeGreaterThan(0);
    expect(stages[0].name).toBe('EvidenceCollection');
  });

  test('should validate pipeline configuration', () => {
    const config = PDFAnalysisPipelineFactory.getDefaultConfig();
    const validation = PDFAnalysisPipelineFactory.validateConfig(config);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should handle invalid configuration', () => {
    const invalidConfig = {
      maxRetries: 0, // Invalid: must be >= 1
      timeoutMs: 1000, // Invalid: must be >= 30000
    };
    
    const validation = PDFAnalysisPipelineFactory.validateConfig(invalidConfig);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  test('should create document type specific pipelines', () => {
    const structuralPipeline = PDFAnalysisPipelineFactory.createDocumentTypePipeline('structural');
    const architecturalPipeline = PDFAnalysisPipelineFactory.createDocumentTypePipeline('architectural');
    
    expect(structuralPipeline).toBeDefined();
    expect(architecturalPipeline).toBeDefined();
    
    const structuralStages = structuralPipeline.getStages();
    const architecturalStages = architecturalPipeline.getStages();
    
    expect(structuralStages.length).toBeGreaterThan(0);
    expect(architecturalStages.length).toBeGreaterThan(0);
  });

  test('should get default policy', () => {
    const policy = policyManager.getPolicy('default');
    expect(policy).toBeDefined();
    expect(policy.id).toBe('default');
    expect(policy.thresholds.acceptInference).toBe(0.7);
  });

  test('should handle policy fallback', () => {
    const policy = policyManager.getPolicy('nonexistent_policy');
    expect(policy).toBeDefined();
    expect(policy.id).toBe('default'); // Should fall back to default
  });
});
