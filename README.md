# Pipeline Integration Guide

This document explains how to use the immediate integration of the Inference Ledger with existing services.

## Overview

The Inference Ledger has been integrated into existing services with **zero behavior change** when the feature flag is disabled. All new functionality is gated behind `FeatureFlags.useNewLedger` which defaults to `false`.

## Feature Flags

### Primary Flag
- `useNewLedger`: Controls whether the ledger is created and used (default: `false`)

### Secondary Flags
- `enableAuditTrail`: Controls ledger export functionality (default: `false`)
- `useConflictResolver`: Controls conflict resolution (default: `false`)
- `enableVisionStrategies`: Controls vision-based strategies (default: `false`)

## Usage

### 1. Enable the Feature Flag

```typescript
import { featureFlags } from '@/pipeline';

// Enable ledger integration
featureFlags.setFlag('useNewLedger', true);

// Or use environment variable
process.env.FEATURE_USE_NEW_LEDGER = 'true';
```

### 2. The Ledger is Automatically Created

When `useNewLedger` is enabled, the ledger is automatically created in:
- `pdfAnalysisService.analyzePDF()`
- Passed down to enrichment services
- Persisted at the end of analysis

### 3. Access Ledger Data

```typescript
import { loadLedger } from '@/pipeline';

// Load ledger for a specific document and run
const ledger = await loadLedger(docId, runId);
if (ledger) {
  console.log('Evidence count:', ledger.evidence.length);
  console.log('Inferences count:', ledger.inferences.length);
  console.log('Decisions count:', ledger.decisions.length);
  console.log('Flags count:', ledger.flags.length);
}
```

### 4. Export Ledger for Audit

```typescript
import { exportService } from '@/services/exportService';

// Export ledger as JSON
const fileUri = await exportService.exportLedgerJSON(docId, runId);
if (fileUri) {
  console.log('Ledger exported to:', fileUri);
}
```

## What Gets Recorded

### Evidence
- **Text extraction**: AI-extracted text from PDFs
- **Baseline parse results**: Structured analysis output
- **Enrichment results**: Module outputs and confidence scores
- **Vision analysis**: AI vision task results

### Inferences
- **Baseline parse**: Each line item becomes an inference
- **Enrichment**: Module processing results
- **Pattern recognition**: Evidence-based pattern inferences

### Decisions
- **Expert decisions**: Where expert rules choose values
- **Legacy selections**: Single-candidate selections
- **Policy applications**: Threshold and tie-breaker decisions

### Flags
- **Missing information**: When data is incomplete
- **Policy violations**: When thresholds aren't met
- **Vision skipped**: When vision analysis is skipped
- **Legacy path**: Notes about legacy processing

## Integration Points

### Services Modified
1. **pdfAnalysisService.ts**: Main entry point, ledger creation
2. **enrichmentService.ts**: Enrichment module results
3. **ExpertDecisionModule.ts**: Expert rule decisions
4. **VisionEnrichmentModule.ts**: Vision analysis results
5. **exportService.ts**: Ledger export functionality

### Data Flow
```
PDF Analysis → Evidence Collection → Inference Generation → Decision Recording → Ledger Persistence
```

## Testing

### Unit Tests
```bash
npm test -- --testPathPattern=pipeline
```

### Integration Test
```bash
# Test with feature flag enabled
FEATURE_USE_NEW_LEDGER=true npm test

# Test with feature flag disabled (should be identical to baseline)
FEATURE_USE_NEW_LEDGER=false npm test
```

## Performance Impact

- **With flag OFF**: Zero performance impact, identical behavior
- **With flag ON**: Minimal overhead (~5-10ms) for ledger operations
- **Storage**: Ledger data is persisted to storage (localStorage/AsyncStorage)

## Rollback

If issues arise, simply disable the feature flag:

```typescript
featureFlags.setFlag('useNewLedger', false);
```

All existing functionality will continue to work exactly as before.

## Future Enhancements

Once this integration is stable, the following can be added:
1. **Conflict Resolution**: Policy-driven inference reconciliation
2. **Strategy Framework**: Multiple extraction strategies per task
3. **UI Integration**: Audit views and assumption overrides
4. **Advanced Analytics**: Confidence calibration and quality metrics

## Troubleshooting

### Common Issues

1. **Ledger not created**: Check `useNewLedger` flag is enabled
2. **Storage errors**: Check storage permissions and available space
3. **Import errors**: Ensure all pipeline modules are properly exported

### Debug Logging

Enable debug logging to see ledger operations:

```typescript
// Check console for ledger initialization and persistence logs
console.log('[PDFAnalysisService] Ledger initialized for document...');
console.log('[PDFAnalysisService] Ledger persisted for document...');
```

## Support

For questions or issues with the integration:
1. Check the console logs for ledger operations
2. Verify feature flags are properly set
3. Test with a simple document first
4. Review the integration test examples
