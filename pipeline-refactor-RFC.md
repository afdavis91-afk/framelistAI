# PDF Analysis App Pipeline Refactor RFC

## 1. Executive Summary

This RFC proposes a comprehensive refactor of the PDF analysis app from a linear service chain to a **policy-driven, evidence-first pipeline** with an **Inference Ledger**. The refactor introduces:

- **Evidence Collection**: Raw artifacts from PDFs, Vision analysis, and user inputs
- **Assumption Management**: First-class assumptions that can be referenced, revised, and audited
- **Inference Generation**: Multiple strategies per task with confidence scoring
- **Decision Reconciliation**: Policy-driven conflict resolution using thresholds and tie-breakers
- **Inference Ledger**: Append-only journal of all artifacts with full provenance

The refactor maintains backward compatibility while providing the foundation for advanced features like scenario analysis, confidence calibration, and automated quality assurance.

## 2. Problem Statement & Current Architecture

### Current Issues
- **Linear Processing**: Services execute in sequence without clear data flow or conflict resolution
- **Limited Auditability**: Difficult to trace material specifications back to source documents
- **Hard-coded Rules**: Expert decision logic embedded in service code, difficult to modify
- **No Conflict Resolution**: Multiple extraction methods may produce conflicting results
- **Limited Flexibility**: No policy-driven configuration for different project types or scenarios

### Current Architecture
```
PDFs → Ingest → Parse → Enrich → Reconcile → Quantify → Price → Export
```

The current system processes documents linearly through services, with enrichment modules applying rules sequentially. There's no systematic way to:
- Track evidence used for each decision
- Resolve conflicts between different extraction methods
- Apply project-specific policies
- Audit the reasoning behind material specifications

## 3. Proposed Solution & Architecture

### New Pipeline Architecture
```
PDFs → Evidence Collection → Assumption Seeding → Multi-Strategy Inference → 
      Conflict Resolution → Decision Generation → MaterialLine Creation → 
      Pricing → Export + Ledger
```

### Key Components

#### 3.1 Evidence Collection
- **Text Evidence**: OCR and text extraction from PDFs
- **Table Evidence**: Schedule parsing and table detection
- **Symbol Evidence**: Drawing symbol recognition
- **Dimension Evidence**: Measurement and dimension extraction
- **Vision Evidence**: AI-powered analysis using Vision APIs

#### 3.2 Assumption Management
- **IRC Code Defaults**: Building code minimums and requirements
- **Regional Defaults**: Species, grades, and material preferences
- **Document-Derived**: Assumptions extracted from specification clauses
- **User Overrides**: Project-specific assumptions and preferences

#### 3.3 Multi-Strategy Inference
- **Strategy Pattern**: Each extraction task has multiple strategies
- **Confidence Scoring**: Each strategy produces confidence scores
- **Evidence Linking**: Inferences reference specific evidence and assumptions
- **Alternative Generation**: Strategies provide alternative values when possible

#### 3.4 Conflict Resolution
- **Policy-Driven**: Uses configurable thresholds and tie-breakers
- **Source Reliability**: Weights different evidence sources by reliability
- **Auto-Resolution**: Automatically resolves conflicts above confidence thresholds
- **Manual Review**: Flags conflicts requiring human intervention

#### 3.5 Inference Ledger
- **Append-Only**: Immutable record of all processing steps
- **Full Provenance**: Every decision traces back to evidence and assumptions
- **Audit Trail**: Complete history for compliance and quality assurance
- **Export Capability**: JSON export for external analysis and reporting

## 4. Migration Strategy

### Phase 1: Core Infrastructure (PR1)
- Introduce core types and interfaces
- Implement InferenceLedger and PolicyManager
- Wrap existing services to append ledger entries
- Add feature flags for gradual rollout

### Phase 2: Strategy Implementation (PR2)
- Implement extraction strategies for key tasks
- Add conflict resolution engine
- Integrate with existing enrichment services
- Update material validation to consume decisions

### Phase 3: UI Integration
- Add audit views for material lines
- Implement assumption override interface
- Surface conflict resolution information
- Provide ledger export functionality

## 5. Implementation Plan

### 5.1 Core Types & Interfaces
```typescript
interface Evidence {
  id: string;
  type: "text" | "image" | "table" | "symbol" | "dimension" | "schedule";
  source: { documentId: string; pageNumber: number; extractor: string; confidence: number; };
  content: any;
  metadata: Record<string, any>;
  timestamp: string;
  version: string;
}

interface Assumption {
  id: string;
  key: string;
  value: any;
  basis: "irc_code" | "user_override" | "document_derived" | "regional_default";
  confidence: number;
  supersedes?: string;
  timestamp: string;
}

interface Inference<T = any> {
  id: string;
  topic: string;
  value: T;
  confidence: number;
  method: string;
  usedEvidence: string[];
  usedAssumptions: string[];
  explanation: string;
  alternatives: Array<{value: T, confidence: number, reason: string}>;
  timestamp: string;
  stage: string;
}

interface Decision<T = any> {
  id: string;
  topic: string;
  selectedValue: T;
  selectedInferenceId: string;
  competingInferences: string[];
  justification: string;
  policyUsed: { thresholds: Record<string, number>; tiebreakers: string[]; appliedRules: string[]; };
  timestamp: string;
  stage: string;
}
```

### 5.2 Policy Configuration
```typescript
interface Policy {
  thresholds: {
    acceptInference: number;      // 0.7
    conflictGap: number;          // 0.15
    maxAmbiguity: number;         // 0.3
  };
  priors: {
    sourceReliability: Record<string, number>; // schedule: 0.9, notes: 0.7, vision: 0.8
  };
  tiebreakers: string[];          // ["schedule_table", "explicit_note", "plan_symbol", "vision_llm"]
  extraction: { maxVisionTokens: number; maxPages: number; enableGeometry: boolean; };
  pricing: { minAccept: number; maxConcurrent: number; retries: number; timeoutMs: number; };
}
```

### 5.3 Pipeline Stages
1. **EvidenceCollectionStage**: Collects evidence from various sources
2. **AssumptionSeedingStage**: Seeds default and document-derived assumptions
3. **MultiStrategyInferenceStage**: Executes multiple strategies per topic
4. **ConflictResolutionStage**: Resolves conflicts using policy rules
5. **MaterialLineCreationStage**: Creates material lines from decisions

### 5.4 Strategy Framework
```typescript
abstract class BaseStrategy<T = any> {
  abstract readonly name: string;
  abstract readonly topic: string;
  abstract readonly method: string;
  abstract readonly sourceType: string;
  
  abstract canHandle(context: StrategyContext): boolean;
  abstract execute(context: StrategyContext, ctx: PipeCtx): Promise<StrategyResult<T>>;
  
  getPriority(): number;
  getSourceReliability(ctx: PipeCtx): number;
  getTiebreakerPriority(ctx: PipeCtx): number;
}
```

## 6. Testing Strategy

### 6.1 Unit Tests
- Each strategy tested with fixtures
- Policy validation and conflict resolution
- Ledger integrity and validation

### 6.2 Integration Tests
- End-to-end pipeline execution
- Strategy interaction and conflict resolution
- Ledger generation and export

### 6.3 Performance Tests
- Pipeline execution time
- Memory usage and scalability
- Strategy execution efficiency

## 7. Rollback Plan

### 7.1 Feature Flags
- `useNewLedger`: Enable/disable inference ledger
- `useConflictResolver`: Enable/disable conflict resolution
- `enableVisionStrategies`: Enable/disable vision-based strategies
- `enableAuditTrail`: Enable/disable audit trail generation

### 7.2 Fallback Strategies
- Policy fallback to "legacy_compat_v0"
- Simple confidence-based selection if conflict resolver fails
- Existing enrichment modules if new strategies fail

### 7.3 Data Migration
- Existing outputs preserved with additive metadata
- Gradual migration of material lines to new format
- Backward compatibility maintained for 2 major versions

## 8. Open Questions

### 8.1 Performance Impact
- What is the expected performance overhead of the new pipeline?
- How does the pipeline scale with large documents or projects?
- What are the memory requirements for the inference ledger?

### 8.2 Policy Versioning
- How should policy versioning be handled across project updates?
- What is the migration strategy for policy changes?
- How are policy conflicts resolved between different sources?

### 8.3 User Experience
- What is the optimal UI for presenting conflicts to users?
- How should assumption overrides be presented and managed?
- What level of detail should be shown in audit views?

### 8.4 Data Persistence
- How should the inference ledger be persisted and archived?
- What are the storage requirements for large projects?
- How should ledger data be backed up and restored?

## 9. Success Metrics

### 9.1 Quality Metrics
- Reduction in manual review requirements
- Improvement in confidence scores
- Decrease in conflict resolution time

### 9.2 Performance Metrics
- Pipeline execution time
- Strategy success rates
- Memory and CPU usage

### 9.3 User Experience Metrics
- User adoption of new features
- Reduction in support requests
- Improvement in user satisfaction scores

## 10. Timeline & Milestones

### Week 1-2: Core Infrastructure
- Implement core types and interfaces
- Create InferenceLedger and PolicyManager
- Set up pipeline framework

### Week 3-4: Strategy Implementation
- Implement base strategy framework
- Create joist schedule strategy
- Add conflict resolution engine

### Week 5-6: Integration & Testing
- Integrate with existing services
- Add comprehensive testing
- Performance optimization

### Week 7-8: UI Integration
- Add audit views
- Implement assumption overrides
- Provide ledger export

## 11. Conclusion

The proposed pipeline refactor represents a significant architectural improvement that addresses the current limitations while maintaining backward compatibility. The evidence-first approach provides unprecedented auditability and flexibility, while the policy-driven conflict resolution ensures consistent and explainable results.

The phased migration approach minimizes risk and allows for gradual adoption of new features. The comprehensive testing strategy ensures reliability and performance, while the feature flags provide easy rollback capabilities if needed.

This refactor positions the application for future enhancements including:
- Advanced scenario analysis and what-if modeling
- Machine learning-based confidence calibration
- Automated quality assurance and compliance checking
- Integration with external analysis and reporting tools

The investment in this refactor will pay dividends in improved user experience, reduced manual review requirements, and enhanced compliance capabilities.
