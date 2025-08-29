// Core pipeline types
export * from './types';

// Core pipeline classes
export { Pipeline, PipelineResult, PipelineConfig } from './Pipeline';
export { InferenceLedger } from './InferenceLedger';
export { PolicyManager, policyManager } from './PolicyManager';
export { PipeCtx } from './PipeCtx';

// Pipeline factory
export { PDFAnalysisPipelineFactory, PDFAnalysisPipelineConfig } from './PipelineFactory';

// Pipeline stages
export { EvidenceCollectionStage, EvidenceCollectionInput, EvidenceCollectionOutput } from './stages/EvidenceCollection';
export { AssumptionSeedingStage, AssumptionSeedingInput, AssumptionSeedingOutput } from './stages/AssumptionSeeding';
export { MultiStrategyInferenceStage, MultiStrategyInferenceInput, MultiStrategyInferenceOutput } from './stages/MultiStrategyInference';
export { ConflictResolutionStage, ConflictResolutionInput, ConflictResolutionOutput } from './stages/ConflictResolution';

// Strategy framework
export { BaseStrategy, StrategyResult, StrategyContext } from './strategies/base/BaseStrategy';
export { JoistScheduleStrategy } from './strategies/joist/JoistScheduleStrategy';

// Conflict resolution
export { ConflictResolver, ConflictResolutionResult, ConflictCandidate } from './conflict/ConflictResolver';

// Default policy configuration
export { default as defaultPolicy } from './config/defaultPolicy.json';

// Integration utilities
export { featureFlags, useNewLedger, enableAuditTrail } from './featureFlags';
export { loadPolicy, loadDefaultPolicy, policyFromSettings } from './policy';
export { Ledger } from './ledger';
export { createContext, appendEvidence, appendInference, appendDecision, appendFlag, type MaybeCtx, type SimplePipeCtx } from './context';
export { saveLedger, loadLedger, deleteLedger, listLedgerKeys } from './storageUtils';

// Re-export types for convenience
export type { Evidence, Assumption, Inference, Decision, Flag, Policy, PipeCtx } from './types';
