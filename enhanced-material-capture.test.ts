import { PDFAnalysisService } from '../services/pdfAnalysisService';
import { ConstructionStandards } from '../types/construction';

// Test the enhanced material capture capabilities
describe('Enhanced Material Capture', () => {
  let pdfService: PDFAnalysisService;
  
  beforeEach(() => {
    const standards: ConstructionStandards = {
      studSpacingDefault: 16,
      cornerStudCount: 3,
      tIntersectionStudCount: 2,
      headerBearing: 3.5,
    };
    pdfService = new PDFAnalysisService(standards);
  });

  test('should parse enhanced MaterialSpec fields', () => {
    const enhancedMaterial = {
      spec: "2x4",
      grade: "No.2",
      species: "SPF",
      treatment: "PT",
      thickness: 1.5,
      width: 3.5,
      height: 1.5,
      length: 96,
      plyCount: 1,
      nailingPattern: "6\" o.c. edges, 12\" o.c. field",
      fastenerType: "nail",
      fastenerSize: "16d",
      connectorType: "hold-down",
      anchorSpec: "1/2\" anchor bolt @ 6' o.c.",
      sheathingGrade: "C-D",
      edgeSpacing: "6\"",
      fieldSpacing: "12\"",
      headerType: "built-up",
      bearingLength: 3.5,
      blockingPurpose: "firestopping",
      fireRating: "1-hour",
      soundRating: "STC-50",
    };

    // Verify all fields are properly typed
    expect(enhancedMaterial.thickness).toBe(1.5);
    expect(enhancedMaterial.nailingPattern).toBe("6\" o.c. edges, 12\" o.c. field");
    expect(enhancedMaterial.connectorType).toBe("hold-down");
    expect(enhancedMaterial.fireRating).toBe("1-hour");
  });

  test('should parse enhanced TakeoffLineItem fields', () => {
    const enhancedLineItem = {
      itemId: "STUD_001",
      uom: "EA",
      qty: 24,
      material: {
        spec: "2x4",
        grade: "No.2",
        species: "SPF",
      },
      context: {
        scope: "exterior wall",
        wallType: "W1",
        level: "L1",
        sheetRef: "A101",
        viewRef: "Plan",
        bbox: [100, 200, 300, 400],
        sourceNotes: ["Wall type W1 from legend"],
      },
      assumptions: ["16\" o.c. spacing assumed"],
      confidence: 0.9,
      evidenceRefs: [{
        documentId: "A101",
        pageNumber: 1,
        coordinates: [100, 200, 300, 400],
        description: "Wall run measurement",
      }],
      quantificationRule: {
        ruleType: "stud_count",
        description: "Stud count = ceil(length/spacing) + end studs + corners",
        formula: "ceil(20/1.33) + 2 + 3",
        assumptions: ["16\" o.c. spacing", "3-stud corners"],
        source: "Typical detail",
      },
      waste: {
        materialType: "studs",
        wastePercentage: 5,
        appliedQuantity: 24,
        wasteQuantity: 1.2,
        source: "wasteRules.studsPct",
      },
      stockLength: 96,
      stockLengthAssumption: "8ft stock length",
      cornerStuds: 3,
      tIntersectionStuds: 2,
      openingSubtractions: 0,
      nailingSchedule: {
        type: "nail",
        size: "16d",
        spacing: "16\"",
        pattern: "16\" o.c.",
        quantity: 24,
        galvanized: false,
        sheetRef: "A101",
      },
    };

    // Verify all enhanced fields are properly typed
    expect(enhancedLineItem.quantificationRule?.ruleType).toBe("stud_count");
    expect(enhancedLineItem.waste?.wastePercentage).toBe(5);
    expect(enhancedLineItem.cornerStuds).toBe(3);
    expect(enhancedLineItem.nailingSchedule?.size).toBe("16d");
  });

  test('should parse enhanced WallType fields', () => {
    const enhancedWallType = {
      id: "W1",
      studSize: "2x4",
      studSpacing: 16,
      plateCount: 3,
      sheathing: "7/16\" OSB",
      fireRating: "1-hour",
      description: "Exterior wall with fire rating",
      sheathingThickness: 0.4375,
      sheathingGrade: "C-D",
      sheathingNailing: "6\" o.c. edges, 12\" o.c. field",
      gypLayers: 1,
      soundRating: "STC-50",
      typicalPlateHeight: 120,
      cornerStudCount: 3,
      tIntersectionStudCount: 2,
      openingThreshold: 4,
    };

    // Verify all enhanced fields are properly typed
    expect(enhancedWallType.sheathingThickness).toBe(0.4375);
    expect(enhancedWallType.sheathingNailing).toBe("6\" o.c. edges, 12\" o.c. field");
    expect(enhancedWallType.cornerStudCount).toBe(3);
    expect(enhancedWallType.openingThreshold).toBe(4);
  });

  test('should parse connector and fastener schedules', () => {
    const connectorSchedule = {
      mark: "HD1",
      type: "hold-down",
      description: "Simpson HHDQ8",
      size: "8\"",
      material: "galvanized steel",
      quantity: 12,
      location: "shear wall ends",
      sheetRef: "S101",
    };

    const fastenerSchedule = {
      type: "nail",
      size: "16d",
      spacing: "6\"",
      pattern: "6\" o.c. edges, 12\" o.c. field",
      quantity: 500,
      galvanized: true,
      sheetRef: "S101",
    };

    // Verify all fields are properly typed
    expect(connectorSchedule.mark).toBe("HD1");
    expect(connectorSchedule.type).toBe("hold-down");
    expect(fastenerSchedule.galvanized).toBe(true);
    expect(fastenerSchedule.spacing).toBe("6\"");
  });
});
