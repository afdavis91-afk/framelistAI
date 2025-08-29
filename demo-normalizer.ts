import { MaterialSpecNormalizer } from './MaterialSpecNormalizer';

// Demo the material spec normalizer with the actual specs from your Pricing Results screen
function demoNormalizer() {
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

  materialSpecs.forEach(spec => {
    console.log(`Original: "${spec}"`);
    
    const normalized = MaterialSpecNormalizer.normalizeSpec(spec);
    
    console.log(`Normalized: "${normalized.normalizedSpec}"`);
    console.log(`Category: ${normalized.category}`);
    console.log(`Species: ${normalized.species || 'N/A'}`);
    console.log(`Grade: ${normalized.grade || 'N/A'}`);
    console.log(`Treatment: ${normalized.treatment || 'N/A'}`);
    console.log(`Purpose: ${normalized.purpose || 'N/A'}`);
    console.log(`Dimensions: ${JSON.stringify(normalized.dimensions)}`);
    console.log(`Confidence: ${normalized.confidence.toFixed(2)}`);
    console.log('---\n');
  });

  console.log('=== Expected Pricing Results ===\n');
  console.log('With proper normalization, these specs should now generate valid pricing:');
  
  materialSpecs.forEach(spec => {
    const normalized = MaterialSpecNormalizer.normalizeSpec(spec);
    console.log(`• ${spec} → ${normalized.normalizedSpec} (${normalized.category})`);
  });
}

// Run the demo
if (require.main === module) {
  demoNormalizer();
}

export { demoNormalizer };
