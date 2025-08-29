# Material Spec Normalizer

## Overview

The `MaterialSpecNormalizer` is a utility class that transforms raw material specification strings from your analysis system into normalized, human-readable material names that can be properly parsed by the pricing system.

## Problem Solved

Your original material specs like `"STUDS_2X4_16OC"` were causing `$NaN USD` pricing because:

1. **Parsing Failures**: The original `lineItemToSpecKey()` function couldn't properly parse these abbreviated, underscore-separated specs
2. **Missing Dimensions**: The pricing system couldn't extract proper dimensions (2x4) from the raw strings
3. **Category Mismatches**: Material categories weren't being properly identified
4. **Fallback to Zero**: When parsing failed, the system fell back to `unitPrice: 0`, but display issues showed `NaN`

## How It Works

### 1. **Pattern Recognition**
The normalizer recognizes common material patterns:
- `STUDS_2X4_16OC` → `2x4 spf stud`
- `PLATES_BOTTOM_PT` → `2x4 spf std pressure treated bottom`
- `FLOOR_JOISTS_2X12` → `2x12 spf std`
- `SHEATHING_WALL_OSB_716_EXTERIORINTERIOR` → `7/16" osb sheathing exterior interior`

### 2. **Dimension Extraction**
- **Lumber**: Extracts `2x4`, `2x6`, `2x8`, `2x10`, `2x12` patterns
- **Sheathing**: Extracts thickness like `7/16"`, `5/8"`, `3/4"`
- **Length**: Extracts length like `8ft`, `10'`, `16'`

### 3. **Material Classification**
- **Lumber**: Studs, plates, joists, beams, headers, blocking
- **Sheathing**: OSB, plywood, wall sheathing
- **Fasteners**: Nails, screws, bolts
- **Connectors**: Hangers, anchors, brackets

### 4. **Property Inference**
- **Species**: Defaults to SPF (Spruce-Pine-Fir) for lumber
- **Grade**: Infers stud grade for studs, structural for beams
- **Treatment**: Detects pressure-treated, fire-retardant, etc.
- **Purpose**: Identifies bottom, top, exterior, interior, etc.

## Usage

### Basic Normalization
```typescript
import { MaterialSpecNormalizer } from '../pricing/MaterialSpecNormalizer';

const normalized = MaterialSpecNormalizer.normalizeSpec('STUDS_2X4_16OC');
console.log(normalized.normalizedSpec); // "2x4 spf stud"
console.log(normalized.category);       // "lumber"
console.log(normalized.confidence);     // 0.9
```

### Integration with Pricing Store
The normalizer is now integrated into your pricing store's `lineItemToSpecKey()` function:

```typescript
function lineItemToSpecKey(lineItem: TakeoffLineItem): SpecKey {
  // First, normalize the material spec to get better parsing
  const normalizedSpec = MaterialSpecNormalizer.normalizeSpec(lineItem.material.spec);
  
  // Use the normalized spec for better parsing
  const spec = normalizedSpec.normalizedSpec.toLowerCase();
  
  // ... rest of the function uses normalized data
}
```

## Expected Results

With the normalizer in place, your material specs should now generate proper pricing:

| Original Spec | Normalized Spec | Category | Expected Price |
|---------------|-----------------|----------|----------------|
| `STUDS_2X4_16OC` | `2x4 spf stud` | lumber | $2.50 - $3.50 per LF |
| `PLATES_BOTTOM_PT` | `2x4 spf std pressure treated bottom` | lumber | $3.00 - $4.50 per LF |
| `FLOOR_JOISTS_2X12` | `2x12 spf std` | lumber | $8.00 - $12.00 per LF |
| `SHEATHING_WALL_OSB_716_EXTERIORINTERIOR` | `7/16" osb sheathing exterior interior` | sheathing | $0.65 - $0.85 per SF |

## Confidence Scoring

The normalizer provides confidence scores (0.0 - 1.0) based on:
- **High (0.8-1.0)**: Well-defined specs with clear dimensions and categories
- **Medium (0.6-0.8)**: Specs with some ambiguity but clear main properties
- **Low (0.4-0.6)**: Specs with limited information or unclear categories
- **Very Low (0.1-0.4)**: Failed parsing or unknown materials

## Testing

Run the demo to see the normalizer in action:

```bash
# Run the demo script
npx ts-node src/pricing/demo-normalizer.ts

# Run the tests
npm test -- MaterialSpecNormalizer.test.ts
```

## Troubleshooting

### Still Getting NaN?
1. **Check Console Logs**: Look for "Normalizing material spec" messages
2. **Verify Confidence**: Low confidence scores indicate parsing issues
3. **Check Material Specs**: Ensure your specs follow expected patterns
4. **Review Fallback Logic**: The system should fall back to `unitPrice: 0`, not `NaN`

### Adding New Patterns
To support new material types, add patterns to the `MATERIAL_PATTERNS` object:

```typescript
NEW_MATERIAL: {
  patterns: [/new_material/i, /^nm/i],
  category: "your_category",
  defaultSpecies: "default_species",
  defaultGrade: "default_grade"
}
```

## Benefits

1. **Eliminates NaN Pricing**: Proper parsing prevents pricing failures
2. **Improves Accuracy**: Better material identification leads to more accurate pricing
3. **Maintains Compatibility**: Works with existing pricing infrastructure
4. **Provides Transparency**: Clear logging shows what's happening during normalization
5. **Handles Edge Cases**: Graceful fallbacks for unknown or malformed specs

## Next Steps

1. **Test the Integration**: Run pricing on your existing material specs
2. **Monitor Logs**: Watch for normalization messages in the console
3. **Verify Pricing**: Confirm that prices are now numeric instead of NaN
4. **Fine-tune Patterns**: Adjust patterns based on your specific material naming conventions
