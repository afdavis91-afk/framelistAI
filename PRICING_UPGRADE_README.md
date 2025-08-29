# Robust Pricing Model Upgrade

This document describes the implementation of a robust pricing model upgrade with strong determinism, explainability (Inference Ledger), and backtesting capabilities.

## Overview

The pricing system has been upgraded from a simple mock-based approach to a sophisticated, AI-driven pricing engine that:

- Uses weighted median selection over normalized, regionalized, and optionally landed unit prices
- Provides transparent scoring with confidence bands (p25/p50/p75)
- Maintains full inference ledger entries for auditability
- Supports backtesting with golden test cases
- Integrates with existing live retail and baseline pricing providers

## New Architecture

### Core Pricing Modules

1. **SpecKey** (`src/pricing/SpecKey.ts`)
   - Material specification key with standardized material types, species, profiles, and grades
   - Stable key generation for consistent pricing lookups

2. **UOM** (`src/pricing/Uom.ts`)
   - Unit of measure normalization and quantity handling
   - Pack size support for bulk materials

3. **PriceQuote** (`src/pricing/PriceQuote.ts`)
   - Normalized price quote interface with vendor reliability and parsing scores
   - Stock availability and freight policy information

4. **RegionIndex** (`src/pricing/RegionIndex.ts`)
   - Regional market indices for price regionalization
   - CBSA-based cost adjustments

5. **Landed** (`src/pricing/Landed.ts`)
   - Landed cost calculations including delivery, tax, and minimum quantity top-ups
   - Placeholder implementations for real delivery providers

6. **Selector** (`src/pricing/Selector.ts`)
   - Weighted median price selection with confidence scoring
   - Quote filtering and scoring based on freshness, vendor reliability, and stock status

7. **Blend** (`src/pricing/Blend.ts`)
   - Intelligent blending of catalog and live pricing data
   - Configurable blend ratios

8. **Ledger** (`src/pricing/Ledger.ts`)
   - Inference ledger for tracking pricing decisions and assumptions
   - ASSUMPTION, INFERENCE, and DECISION entry types

### Provider Runner

The new `ProviderRunner` class (`src/pricing/ProviderRunner.ts`) orchestrates the entire pricing process:

- Converts takeoff line items to standardized spec keys
- Applies regional indices and landed cost calculations
- De-duplicates quotes and applies filtering
- Selects optimal pricing using weighted median selection
- Maintains comprehensive inference ledger
- Supports blending of catalog and live pricing streams

## Configuration Options

The pricing system now supports these advanced options:

```typescript
interface CostOptions {
  // Core pricing options
  useRegionalIndex: boolean;        // Apply regional market indices
  useLanded: boolean;               // Calculate landed costs (delivery + tax)
  blendCatalogLive: number;         // 0..1 blend ratio (0=catalog only, 1=live only)
  requireInStock: boolean;          // Filter to in-stock items only
  maxQuoteAgeDays: number;          // Maximum age of quotes to consider
  minAccept: number;                // Minimum confidence threshold
  
  // Legacy options (backward compatibility)
  priceAsOf?: string;               // Specific pricing date
  maxConcurrent: number;            // Concurrent API requests
  retries: number;                  // Retry attempts
  timeoutMs: number;                // Request timeout
  vendorPrefs?: string[];           // Preferred vendor list
  currency: "USD" | string;         // Currency
  fxRate?: number;                  // Foreign exchange rate
}
```

## Usage

### Running Pricing Analysis

```typescript
import { usePricingStore } from "../state/pricingStore";

const { runPricing } = usePricingStore();

// Run pricing for a project's line items
await runPricing(projectId, lineItems);
```

### Customizing Pricing Options

```typescript
const { setOptions } = usePricingStore();

setOptions({
  useRegionalIndex: true,           // Enable regional pricing
  useLanded: true,                  // Include delivery costs
  blendCatalogLive: 0.7,            // 70% live, 30% catalog
  requireInStock: false,            // Allow backorders
  maxQuoteAgeDays: 14,              // Only recent quotes
  minAccept: 0.9                    // High confidence threshold
});
```

## Backtesting

### Running Backtests

```bash
# Run backtest for specific date
ts-node scripts/backtest.ts --asOf=2025-08-01

# Expected output shows:
# - Individual test case results (PASS/FAIL)
# - MAPE (Mean Absolute Percentage Error)
# - Coverage percentage
# - Overall success/failure based on criteria
```

### Backtest Criteria

- **Success**: Average MAPE ≤ 12% AND Coverage ≥ 90%
- **MAPE**: Measures pricing accuracy vs. expected values
- **Coverage**: Percentage of test cases that complete successfully

### Golden Test Cases

The backtest system includes pre-defined test cases for common materials:

- 2x4x8 SPF lumber
- Plywood 4x8 1/2"
- 2x6x10 SYP lumber

Additional test cases can be added to `scripts/backtest.ts`.

## Inference Ledger

Every pricing decision is logged with detailed metadata:

### Entry Types

1. **ASSUMPTION**: Configuration choices and parameter values
   - Regional index application
   - Landed cost calculations
   - Currency conversions

2. **INFERENCE**: Data processing and analysis
   - Quote deduplication
   - Price selection results
   - Confidence calculations

3. **DECISION**: Final pricing decisions and rationale
   - Selection basis (CATALOG/LIVE/BLENDED)
   - Blend ratios and reasoning
   - Error conditions

### Ledger Access

```typescript
// Access ledger entries for a pricing result
const { lastResultByProject } = usePricingStore();
const result = lastResultByProject[projectId];

if (result.ledger) {
  result.ledger.forEach(entry => {
    console.log(`${entry.type}: ${entry.message}`);
    console.log('Data:', entry.data);
  });
}
```

## Testing

### Unit Tests

```bash
# Run pricing core tests
npm test src/pricing/__tests__/pricing.test.ts
```

Tests cover:
- Weighted median calculations
- Price selection logic
- Regional index functions
- Landed cost calculations
- Blending functions

### Integration Testing

The system integrates with existing:
- Live retail pricing providers (Home Depot, Lowe's, etc.)
- RSMeans baseline pricing
- Takeoff line item processing
- Project management workflows

## Performance Characteristics

- **Deterministic**: Same inputs produce same outputs
- **Scalable**: Processes multiple line items efficiently
- **Robust**: Handles provider failures gracefully
- **Auditable**: Complete decision trail for compliance

## Migration Notes

### Backward Compatibility

- Existing pricing flows continue to work
- New options have sensible defaults
- Legacy options are preserved
- No breaking changes to existing APIs

### New Features

- Enhanced pricing accuracy with weighted median selection
- Regional price adjustments
- Landed cost calculations
- Comprehensive audit trail
- Backtesting capabilities

## Future Enhancements

1. **Real Delivery Providers**: Replace placeholder delivery cost calculations
2. **Tax Jurisdiction Logic**: Implement real tax calculation based on project location
3. **Advanced Blending**: Machine learning-based blend ratio optimization
4. **Market Intelligence**: Real-time market trend analysis
5. **Supplier Performance**: Dynamic vendor reliability scoring

## Troubleshooting

### Common Issues

1. **Pricing Failures**: Check provider availability and network connectivity
2. **Low Confidence**: Verify quote freshness and vendor reliability scores
3. **Regional Issues**: Ensure project location is properly set
4. **Backtest Failures**: Review golden test case expectations vs. current market conditions

### Debug Information

Enable detailed logging by accessing the inference ledger:

```typescript
const result = lastResultByProject[projectId];
console.log('Pricing Ledger:', result.ledger);
console.log('Provider Metadata:', result.providerMeta);
```

## Support

For questions or issues with the pricing upgrade:

1. Check the inference ledger for detailed decision information
2. Review backtest results for accuracy validation
3. Verify configuration options are set correctly
4. Check provider availability and API limits
