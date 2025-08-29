import { 
  normalizeLevel, 
  normalizeLevelScored, 
  inferLevelFromSheet, 
  summarizeLevels,
  type CanonicalLevel 
} from '../utils/levels';

describe('Enhanced Level Normalizer', () => {
  describe('normalizeLevel', () => {
    test('should normalize foundation levels', () => {
      expect(normalizeLevel('FFE +0\'-0"')).toBe('FOUNDATION');
      expect(normalizeLevel('TOS')).toBe('FOUNDATION');
      expect(normalizeLevel('SOG')).toBe('FOUNDATION');
      expect(normalizeLevel('basement')).toBe('FOUNDATION');
      expect(normalizeLevel('P1')).toBe('FOUNDATION');
      expect(normalizeLevel('B2')).toBe('FOUNDATION');
    });

    test('should normalize ground floor levels', () => {
      expect(normalizeLevel('First Floor')).toBe('GROUND FLOOR');
      expect(normalizeLevel('Ground Floor')).toBe('GROUND FLOOR');
      expect(normalizeLevel('L1')).toBe('GROUND FLOOR');
      expect(normalizeLevel('01')).toBe('GROUND FLOOR');
      expect(normalizeLevel('1F')).toBe('GROUND FLOOR');
    });

    test('should normalize second floor levels', () => {
      expect(normalizeLevel('Second Floor')).toBe('SECOND FLOOR');
      expect(normalizeLevel('L2')).toBe('SECOND FLOOR');
      expect(normalizeLevel('02')).toBe('SECOND FLOOR');
      expect(normalizeLevel('2F')).toBe('SECOND FLOOR');
      expect(normalizeLevel('L3')).toBe('SECOND FLOOR');
    });

    test('should normalize roof levels', () => {
      expect(normalizeLevel('Roof Plan')).toBe('ROOF');
      expect(normalizeLevel('Ridge')).toBe('ROOF');
      expect(normalizeLevel('TOP')).toBe('ROOF');
      expect(normalizeLevel('Attic')).toBe('ROOF');
    });

    test('should handle unknown levels', () => {
      expect(normalizeLevel('')).toBe('UNKNOWN');
      expect(normalizeLevel(null)).toBe('UNKNOWN');
      expect(normalizeLevel(undefined)).toBe('UNKNOWN');
      expect(normalizeLevel('unknown')).toBe('UNKNOWN');
      expect(normalizeLevel('N/A')).toBe('UNKNOWN');
    });
  });

  describe('normalizeLevelScored', () => {
    test('should return score and level', () => {
      const result = normalizeLevelScored('FFE +0\'-0"');
      expect(result.level).toBe('FOUNDATION');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should boost sheet title context', () => {
      const withoutContext = normalizeLevelScored('First Floor');
      const withContext = normalizeLevelScored('First Floor', { isSheetTitle: true });
      
      expect(withContext.score).toBeGreaterThan(withoutContext.score);
      expect(withContext.level).toBe(withoutContext.level);
    });

    test('should boost sheet ID context', () => {
      const withoutContext = normalizeLevelScored('L1');
      const withContext = normalizeLevelScored('L1', { isSheetId: true });
      
      expect(withContext.score).toBeGreaterThan(withoutContext.score);
      expect(withContext.level).toBe(withoutContext.level);
    });
  });

  describe('inferLevelFromSheet', () => {
    test('should infer from sheet title when stronger', () => {
      const result = inferLevelFromSheet('A1.1', 'First Floor Plan');
      expect(result).toBe('GROUND FLOOR');
    });

    test('should infer from sheet ID when title is weak', () => {
      const result = inferLevelFromSheet('L2', 'General Notes');
      expect(result).toBe('SECOND FLOOR');
    });

    test('should handle missing inputs', () => {
      expect(inferLevelFromSheet(null, null)).toBe('UNKNOWN');
      expect(inferLevelFromSheet('', '')).toBe('UNKNOWN');
    });
  });

  describe('summarizeLevels', () => {
    test('should count and normalize levels', () => {
      const levels = ['L1', 'L2', 'L1', 'basement', 'roof'];
      const summary = summarizeLevels(levels);
      
      expect(summary).toHaveLength(4); // UNKNOWN levels are filtered out
      
      const groundFloor = summary.find(s => s.level === 'GROUND FLOOR');
      const secondFloor = summary.find(s => s.level === 'SECOND FLOOR');
      const foundation = summary.find(s => s.level === 'FOUNDATION');
      const roof = summary.find(s => s.level === 'ROOF');
      
      expect(groundFloor?.count).toBe(2);
      expect(secondFloor?.count).toBe(1);
      expect(foundation?.count).toBe(1);
      expect(roof?.count).toBe(1);
    });
  });

  describe('edge cases and robustness', () => {
    test('should handle mixed case and whitespace', () => {
      expect(normalizeLevel('  first  floor  ')).toBe('GROUND FLOOR');
      expect(normalizeLevel('FIRST FLOOR')).toBe('GROUND FLOOR');
      expect(normalizeLevel('First Floor')).toBe('GROUND FLOOR');
    });

    test('should handle abbreviations and variations', () => {
      expect(normalizeLevel('1st Flr')).toBe('GROUND FLOOR');
      expect(normalizeLevel('Main Level')).toBe('GROUND FLOOR');
      expect(normalizeLevel('Upper Floor')).toBe('SECOND FLOOR');
    });

    test('should handle international notation', () => {
      expect(normalizeLevel('G')).toBe('GROUND FLOOR');
      expect(normalizeLevel('GF')).toBe('GROUND FLOOR');
    });
  });
});

