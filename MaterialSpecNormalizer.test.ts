import { MaterialSpecNormalizer } from '../MaterialSpecNormalizer';

describe('MaterialSpecNormalizer', () => {
  describe('Lumber Materials', () => {
    test('should normalize STUDS_2X4_16OC to 2x4 spf stud', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('STUDS_2X4_16OC');
      
      expect(result.normalizedSpec).toBe('2x4 spf stud');
      expect(result.category).toBe('lumber');
      expect(result.dimensions.width).toBe(2);
      expect(result.dimensions.height).toBe(4);
      expect(result.species).toBe('spf');
      expect(result.grade).toBe('stud');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should normalize PLATES_BOTTOM_PT to 2x4 spf std pressure treated bottom', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('PLATES_BOTTOM_PT');
      
      expect(result.normalizedSpec).toBe('2x4 spf std pressure treated bottom');
      expect(result.category).toBe('lumber');
      expect(result.species).toBe('spf');
      expect(result.grade).toBe('std');
      expect(result.treatment).toBe('PRESSURE_TREATED');
      expect(result.purpose).toBe('bottom');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should normalize PLATES_TOP_DOUBLE to 2x4 spf std double top', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('PLATES_TOP_DOUBLE');
      
      expect(result.normalizedSpec).toBe('2x4 spf std double top');
      expect(result.category).toBe('lumber');
      expect(result.species).toBe('spf');
      expect(result.grade).toBe('std');
      expect(result.purpose).toBe('top');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should normalize FLOOR_JOISTS_2X12 to 2x12 spf std', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('FLOOR_JOISTS_2X12');
      
      expect(result.normalizedSpec).toBe('2x12 spf std');
      expect(result.category).toBe('lumber');
      expect(result.dimensions.width).toBe(2);
      expect(result.dimensions.height).toBe(12);
      expect(result.species).toBe('spf');
      expect(result.grade).toBe('std');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Sheathing Materials', () => {
    test('should normalize SHEATHING_WALL_OSB_716_EXTERIORINTERIOR to 7/16" osb sheathing exterior interior', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('SHEATHING_WALL_OSB_716_EXTERIORINTERIOR');
      
      expect(result.normalizedSpec).toBe('7/16" osb sheathing exterior interior');
      expect(result.category).toBe('sheathing');
      expect(result.dimensions.thickness).toBe(7/16);
      expect(result.purpose).toBe('exterior');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Connector Materials', () => {
    test('should normalize ANCHOR_BOLT_ASSUMED_1756414195838 to connector', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('ANCHOR_BOLT_ASSUMED_1756414195838');
      
      expect(result.category).toBe('connector');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should normalize HANGER_FOR_FLOOR_JOISTS_2X12 to connector', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('HANGER_FOR_FLOOR_JOISTS_2X12');
      
      expect(result.category).toBe('connector');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('');
      
      expect(result.normalizedSpec).toBe('');
      expect(result.category).toBe('misc');
      expect(result.confidence).toBe(0.1);
    });

    test('should handle unknown material types', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('UNKNOWN_MATERIAL_TYPE');
      
      expect(result.category).toBe('misc');
      expect(result.confidence).toBe(0.5);
    });

    test('should handle mixed case and spacing', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('  StUdS 2x4 16oc  ');
      
      expect(result.normalizedSpec).toBe('2x4 spf stud');
      expect(result.category).toBe('lumber');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Confidence Scoring', () => {
    test('should have high confidence for well-defined specs', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('STUDS_2X4_16OC');
      
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should have lower confidence for ambiguous specs', () => {
      const result = MaterialSpecNormalizer.normalizeSpec('UNKNOWN_MATERIAL');
      
      expect(result.confidence).toBeLessThan(0.6);
    });
  });
});
