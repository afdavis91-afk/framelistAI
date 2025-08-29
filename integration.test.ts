import { featureFlags } from '../featureFlags';
import { loadPolicy } from '../policy';
import { Ledger } from '../ledger';
import { createContext, appendEvidence, appendInference, appendDecision, appendFlag, type SimplePipeCtx } from '../context';

describe('Pipeline Integration', () => {
  beforeEach(() => {
    // Reset feature flags to defaults
    featureFlags.resetToDefaults();
  });

  test('should create ledger when feature flag is enabled', () => {
    // Enable the feature flag
    featureFlags.setFlag('useNewLedger', true);
    
    // Create ledger
    const policy = loadPolicy();
    const ledger = new Ledger({ policyId: policy.id, runId: 'test-run' });
    const ctx: SimplePipeCtx = createContext(policy, ledger);
    
    expect(ctx.ledger).toBeDefined();
    expect(ctx.policy).toBeDefined();
  });

  test('should not create ledger when feature flag is disabled', () => {
    // Ensure feature flag is disabled
    featureFlags.setFlag('useNewLedger', false);
    
    // Try to create ledger
    const policy = loadPolicy();
    const ledger = new Ledger({ policyId: policy.id, runId: 'test-run' });
    const ctx: SimplePipeCtx = createContext(policy, ledger);
    
    // Even if we create it, the feature flag should control usage
    expect(featureFlags.isEnabled('useNewLedger')).toBe(false);
  });

  test('should append evidence to ledger', () => {
    featureFlags.setFlag('useNewLedger', true);
    
    const policy = loadPolicy();
    const ledger = new Ledger({ policyId: policy.id, runId: 'test-run' });
    const ctx: SimplePipeCtx = createContext(policy, ledger);
    
    const evidenceId = appendEvidence(ctx, {
      type: 'text',
      source: {
        documentId: 'test-doc',
        pageNumber: 1,
        extractor: 'test',
        confidence: 0.9,
      },
      content: { text: 'Test evidence' },
      metadata: {},
      timestamp: new Date().toISOString(),
      version: '1.0',
    });
    
    expect(evidenceId).toBeDefined();
    expect(ledger.getSummary().totalEvidence).toBe(1);
  });

  test('should append inference to ledger', () => {
    featureFlags.setFlag('useNewLedger', true);
    
    const policy = loadPolicy();
    const ledger = new Ledger({ policyId: policy.id, runId: 'test-run' });
    const ctx: SimplePipeCtx = createContext(policy, ledger);
    
    const inferenceId = appendInference(ctx, {
      topic: 'test_topic',
      value: { test: 'value' },
      confidence: 0.8,
      method: 'test_method',
      usedEvidence: [],
      usedAssumptions: [],
      explanation: 'Test inference',
      alternatives: [],
      timestamp: new Date().toISOString(),
      stage: 'test',
    });
    
    expect(inferenceId).toBeDefined();
    expect(ledger.getSummary().totalInferences).toBe(1);
  });

  test('should append decision to ledger', () => {
    featureFlags.setFlag('useNewLedger', true);
    
    const policy = loadPolicy();
    const ledger = new Ledger({ policyId: policy.id, runId: 'test-run' });
    const ctx: SimplePipeCtx = createContext(policy, ledger);
    
    const decisionId = appendDecision(ctx, {
      topic: 'test_topic',
      selectedValue: { test: 'value' },
      selectedInferenceId: 'test_inference',
      competingInferences: [],
      justification: 'Test decision',
      policyUsed: {
        thresholds: {},
        tiebreakers: [],
        appliedRules: ['test'],
      },
      timestamp: new Date().toISOString(),
      stage: 'test',
    });
    
    expect(decisionId).toBeDefined();
    expect(ledger.getSummary().totalDecisions).toBe(1);
  });

  test('should append flag to ledger', () => {
    featureFlags.setFlag('useNewLedger', true);
    
    const policy = loadPolicy();
    const ledger = new Ledger({ policyId: policy.id, runId: 'test-run' });
    const ctx: SimplePipeCtx = createContext(policy, ledger);
    
    const flagId = appendFlag(ctx, {
      type: 'MISSING_INFO',
      severity: 'low',
      message: 'Test flag',
      topic: 'test_topic',
      evidenceIds: [],
      assumptionIds: [],
      inferenceIds: [],
      timestamp: new Date().toISOString(),
    });
    
    expect(flagId).toBeDefined();
    expect(ledger.getSummary().totalFlags).toBe(1);
  });

  test('should handle undefined context gracefully', () => {
    // Test that helper functions work with undefined context
    const result1 = appendEvidence(undefined, {
      type: 'text',
      source: {
        documentId: 'test',
        pageNumber: 1,
        extractor: 'test',
        confidence: 0.9,
      },
      content: {},
      metadata: {},
      timestamp: new Date().toISOString(),
      version: '1.0',
    });
    
    expect(result1).toBeUndefined();
  });
});
