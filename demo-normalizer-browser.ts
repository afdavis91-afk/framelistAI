import { MaterialSpecNormalizer } from './MaterialSpecNormalizer';

// Browser/React Native compatible demo function
export function demoNormalizerInBrowser() {
  console.log('=== Material Spec Normalizer Demo ===\n');
  
  // The actual material specs from your Pricing Results screen
  const materialSpecs = [
    'STUDS_2X4_16OC',
    'PLATES_BOTTOM_PT', 
    'PLATES_TOP_DOUBLE',
    'FLOOR_JOISTS_2X12',
    'SHEATHING_WALL_OSB_716_EXTERIORINTERIOR',
    'ANCHOR_BOLT_ASSUMED_1756414195838',
    'HANGER_FOR_FLOOR_JOISTS_2X12'
  ];

  const results = materialSpecs.map(spec => {
    const normalized = MaterialSpecNormalizer.normalizeSpec(spec);
    
    return {
      original: spec,
      normalized: normalized.normalizedSpec,
      category: normalized.category,
      species: normalized.species || 'N/A',
      grade: normalized.grade || 'N/A',
      treatment: normalized.treatment || 'N/A',
      purpose: normalized.purpose || 'N/A',
      dimensions: normalized.dimensions,
      confidence: normalized.confidence
    };
  });

  // Log results in a structured way
  results.forEach(result => {
    console.log(`Original: "${result.original}"`);
    console.log(`Normalized: "${result.normalized}"`);
    console.log(`Category: ${result.category}`);
    console.log(`Species: ${result.species}`);
    console.log(`Grade: ${result.grade}`);
    console.log(`Treatment: ${result.treatment}`);
    console.log(`Purpose: ${result.purpose}`);
    console.log(`Dimensions: ${JSON.stringify(result.dimensions)}`);
    console.log(`Confidence: ${result.confidence.toFixed(2)}`);
    console.log('---\n');
  });

  console.log('=== Expected Pricing Results ===\n');
  console.log('With proper normalization, these specs should now generate valid pricing:');
  
  results.forEach(result => {
    console.log(`• ${result.original} → ${result.normalized} (${result.category})`);
  });

  return results;
}

// Export for use in other parts of the app
export default demoNormalizerInBrowser;
