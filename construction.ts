export interface Project {
  id: string;
  name: string;
  address: string;
  createdAt: Date;
  updatedAt: Date;
  levels: string[];
  documents: ProjectDocument[];
  takeoffs: Takeoff[];
}

export interface ProjectDocument {
  id: string;
  name: string;
  type: DocumentType;
  uri: string;
  size: number;
  uploadedAt: Date;
  processed: boolean;
  processingStatus: ProcessingStatus;
}

export type DocumentType = "architectural" | "structural" | "specifications" | "addenda";

export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

export interface ProjectInfo {
  name: string;
  address: string;
  levels: string[];
  buildingCode?: string;
  seismicCategory?: string;
  windCategory?: string;
}

 export interface Takeoff {
   id: string;
   createdAt: Date;
   updatedAt: Date;
   project: ProjectInfo;
   wallTypes: WallType[];
   lineItems: TakeoffLineItem[];
   // Enhanced schedules for comprehensive material tracking
   connectorSchedules: ConnectorSchedule[];
   fastenerSchedules: FastenerSchedule[];
   // New systems for comprehensive framing analysis
   joistSystems: JoistSystem[];
   roofFraming: RoofFraming[];
   sheathingSystems: SheathingSystem[];
   flags: TakeoffFlag[];
   confidence: number;
   // Optional processing metadata for diagnostics
   processingMeta?: ProcessingMeta;
   // AI expert decisions applied to this takeoff
   decisions?: DecisionRecord[];
 }


export interface TakeoffLineItem {
  itemId: string;
  uom: UnitOfMeasure;
  qty: number;
  material: MaterialSpec;
  context: ItemContext;
  assumptions: string[];
  confidence: number;
  evidenceRefs: EvidenceReference[];
  enrichmentData?: EnrichmentData;
  // Enhanced fields for comprehensive tracking
  quantificationRule?: QuantificationRule;
  waste?: MaterialWaste;
  stockLength?: number;
  stockLengthAssumption?: string;
  cornerStuds?: number;
  tIntersectionStuds?: number;
  openingSubtractions?: number;
  nailingSchedule?: FastenerSchedule;
  // Audit trail reference for inference ledger metadata
  auditRef?: {
    decisionId: string;
    evidenceIds: string[];
    assumptionIds: string[];
  };
}

export type UnitOfMeasure = "EA" | "LF" | "SF" | "BF" | "LBS";

export interface MaterialSpec {
  spec: string;
  grade: string;
  size?: string;
  species?: string;
  treatment?: string;
  // Enhanced fields for comprehensive material capture
  thickness?: number;
  width?: number;
  height?: number;
  length?: number;
  plyCount?: number;
  nailingPattern?: string;
  fastenerType?: string;
  fastenerSize?: string;
  connectorType?: string;
  anchorSpec?: string;
  // Sheathing specific fields
  sheathingGrade?: string;
  edgeSpacing?: string;
  fieldSpacing?: string;
  // Header specific fields
  headerType?: string;
  bearingLength?: number;
  // Blocking specific fields
  blockingPurpose?: string;
  fireRating?: string;
  soundRating?: string;
  // Joist specific fields
  joistType?: "floor" | "ceiling" | "roof";
  joistSpacing?: number;
  joistSpan?: number;
  engineeredType?: "I-joist" | "LVL" | "LSL" | "PSL" | "solid_sawn" | "truss";
  hangerType?: string;
  hangerSize?: string;
  hangerMaterial?: string;
  hangerLoadRating?: number;
  blockingSpacing?: number;
  bridgingType?: string;
  bridgingSpacing?: number;
  // Rafter specific fields
  rafterType?: "common" | "hip" | "valley" | "jack" | "ridge";
  rafterSpacing?: number;
  rafterSpan?: number;
  pitch?: number;
  overhang?: number;
  ridgeBoard?: string;
  collarTies?: string;
  rafterTies?: string;
  birdsCut?: boolean;
  plumbCut?: boolean;
  // Beam specific fields
  beamType?: "header" | "girder" | "ridge" | "collar" | "tie";
  beamSpan?: number;
  designLoad?: number;
  deflectionLimit?: string;
  connectionType?: string;
  // Load specifications
  liveLoad?: number;
  deadLoad?: number;
  snowLoad?: number;
  windLoad?: number;
  seismicRated?: boolean;
  windRated?: boolean;
  // Manufacturing details
  manufacturer?: string;
  model?: string;
  certificationMark?: string;
  // Installation specifications
  installationMethod?: string;
  installationNotes?: string;
}

export interface ItemContext {
  scope: string;
  wallType?: string;
  level: string;
  sheetRef: string;
  viewRef: string;
  bbox?: [number, number, number, number];
  sourceNotes: string[];
}

export interface EvidenceReference {
  documentId: string;
  pageNumber: number;
  coordinates?: [number, number, number, number];
  description: string;
}

export interface WasteRules {
  studsPct: number;
  platesPct: number;
  sheathingPct: number;
  blockingPct: number;
  fastenersPct: number;
  // Enhanced waste rules for new systems
  joistsPct?: number;
  roofFramingPct?: number;
  floorSheathingPct?: number;
  roofSheathingPct?: number;
}

export interface TakeoffFlag {
  type: FlagType;
  message: string;
  severity: FlagSeverity;
  sheets: string[];
  resolved: boolean;
}

export type FlagType = "MISSING_INFO" | "CONFLICT" | "ASSUMPTION" | "LOW_CONFIDENCE" | "SPEC_UNCLEAR";

export type FlagSeverity = "low" | "medium" | "high" | "critical";

export interface WallType {
  id: string;
  studSize: string;
  studSpacing: number;
  plateCount: number;
  sheathing: string;
  fireRating?: string;
  description: string;
  // Enhanced fields for comprehensive wall type specification
  sheathingThickness?: number;
  sheathingGrade?: string;
  sheathingNailing?: string;
  gypLayers?: number;
  soundRating?: string;
  typicalPlateHeight?: number;
  cornerStudCount?: number;
  tIntersectionStudCount?: number;
  openingThreshold?: number;
}

export interface ConstructionStandards {
  studSpacingDefault: number;
  cornerStudCount: number;
  tIntersectionStudCount: number;
  headerBearing: number;
  wasteFactors: WasteRules;
}

// Enrichment system types
export interface EnrichmentData {
  specCandidates: SpecCandidate[];
  scheduleCandidates: ScheduleCandidate[];
  calloutResolutions: CalloutResolution[];
  confidenceBoost: number;
  enrichmentFlags: EnrichmentFlag[];
  // New fields for expert gap analysis and advanced reasoning
  identifiedGaps?: Array<{
    field: string;
    description: string;
    severity: "low" | "medium" | "high";
    suggestedAction: string;
  }>;
  gapAnalysisFlags?: TakeoffFlag[];
  expertReasoning?: string[];
}

export interface SpecCandidate {
  id: string;
  source: string;
  specification: string;
  confidence: number;
  documentId: string;
  pageNumber: number;
  coordinates?: [number, number, number, number];
}

export interface ScheduleCandidate {
  id: string;
  scheduleType: string;
  items: ScheduleItem[];
  documentId: string;
  pageNumber: number;
  confidence: number;
}

export interface ScheduleItem {
  mark: string;
  description: string;
  size?: string;
  material?: string;
  quantity?: number;
}

export interface CalloutResolution {
  callout: string;
  resolvedTo: string;
  confidence: number;
  sourceDocument: string;
  targetDocument: string;
}

export interface EnrichmentFlag {
  type: EnrichmentFlagType;
  message: string;
  severity: FlagSeverity;
  sheets: string[];
  moduleSource: string;
  resolved: boolean;
}

export type EnrichmentFlagType = "SPEC_FOUND" | "SCHEDULE_MATCHED" | "CALLOUT_RESOLVED" | "EVIDENCE_ENHANCED" | "CONFIDENCE_IMPROVED";

export interface EnrichmentContext {
  projectDocuments: ProjectDocument[];
  baselineAnalysis: any;
  constructionStandards: ConstructionStandards;
}

export interface ConnectorSchedule {
  mark: string;
  type: string;
  description: string;
  size?: string;
  material?: string;
  quantity?: number;
  location?: string;
  sheetRef?: string;
}

export interface FastenerSchedule {
  type: string;
  size: string;
  spacing: string;
  pattern: string;
  quantity?: number;
  galvanized?: boolean;
  sheetRef?: string;
}

export interface QuantificationRule {
  ruleType: string;
  description: string;
  formula?: string;
  assumptions: string[];
  source: string;
}

export interface MaterialWaste {
  materialType: string;
  wastePercentage: number;
  appliedQuantity: number;
  wasteQuantity: number;
  source: string;
}

export interface JoistSystem {
  id: string;
  type: "floor" | "ceiling" | "roof";
  joistSize: string;
  joistSpacing: number;
  joistLength: number;
  species: string;
  grade: string;
  treatment?: string;
  blockingSpacing?: number;
  blockingSize?: string;
  fireRating?: string;
  soundRating?: string;
  description: string;
  // Enhanced fields for comprehensive joist specification
  joistDepth: number;
  joistWidth: number;
  engineeredLumber?: boolean;
  engineeredType?: string;
  bearingLength: number;
  hangerType?: string;
  hangerSize?: string;
  bridgingType?: string;
  bridgingSpacing?: number;
}

export interface RoofFraming {
  id: string;
  rafterSize: string;
  rafterSpacing: number;
  rafterLength: number;
  species: string;
  grade: string;
  treatment?: string;
  pitch: number;
  overhang: number;
  ridgeBoard: string;
  collarTies?: string;
  rafterTies?: string;
  description: string;
  // Enhanced fields for comprehensive roof framing
  rafterDepth: number;
  rafterWidth: number;
  engineeredLumber?: boolean;
  engineeredType?: string;
  bearingLength: number;
  hangerType?: string;
  hangerSize?: string;
  blockingSpacing?: number;
  blockingSize?: string;
}

export interface SheathingSystem {
  id: string;
  type: "floor" | "roof" | "wall";
  material: string;
  thickness: number;
  grade: string;
  size: string;
  nailingPattern: string;
  edgeSpacing: string;
  fieldSpacing: string;
  fastenerType: string;
  fastenerSize: string;
  description: string;
  // Enhanced fields for comprehensive sheathing
  width: number;
  length: number;
  plyCount?: number;
  treatment?: string;
  fireRating?: string;
  moistureResistant?: boolean;
  tongueAndGroove?: boolean;
}

// Drawing Understanding Types
export interface DrawingPage {
  id: string;
  documentId: string;
  pageNumber: number;
  sheetId?: string;
  title?: string;
  discipline: DrawingDiscipline;
  revision?: string;
  scale?: DrawingScale;
  northArrow?: NorthArrow;
  classification: PageClassification;
  tiles: PageTile[];
  entities: GeoEntity[];
  confidence: number;
  processedAt: Date;
}

export type DrawingDiscipline = "architectural" | "structural" | "mechanical" | "electrical" | "plumbing" | "civil" | "unknown";

export type PageClassification = "plan" | "elevation" | "section" | "detail" | "schedule" | "title" | "legend" | "unknown";

export interface PageTile {
  id: string;
  bounds: BoundingBox;
  imageData: string; // base64 encoded image
  overlaps: string[]; // IDs of overlapping tiles
}

export interface DrawingScale {
  ratio: number; // pixels per inch/foot
  units: "inches" | "feet";
  textRepresentation: string; // e.g., "1/4\" = 1'-0\""
  confidence: number;
  evidenceBox: BoundingBox;
}

export interface NorthArrow {
  center: Point;
  rotation: number; // degrees from east
  confidence: number;
  evidenceBox: BoundingBox;
}

export interface BoundingBox {
  x: number; // normalized [0,1]
  y: number; // normalized [0,1]
  width: number; // normalized [0,1]
  height: number; // normalized [0,1]
}

export interface Point {
  x: number; // normalized [0,1]
  y: number; // normalized [0,1]
}

export interface GeoEntity {
  id: string;
  type: EntityType;
  confidence: number;
  evidenceBox: BoundingBox;
  sourceSheet: string;
  properties: Record<string, any>;
  location?: {
    level?: string;
    area?: string;
    coordinates?: [number, number];
    sheetRef?: string;
    detailRef?: string;
  };
  assumptions?: string[];
  evidence?: {
    source?: string;
    confidence?: number;
    notes?: string;
  };
}

export type EntityType =
  | "wall"
  | "opening"
  | "grid"
  | "dimension"
  | "framing_member"
  | "symbol"
  | "room"
  | "text_label"
  | "connector"
  | "fastener"
  | "joist"
  | "rafter"
  | "beam"
  | "column"
  | "brace"
  | "blocking"
  | "bridging"
  | "hanger"
  | "plate"
  | "stud"
  | "sheathing"
  | "header"
  | "sill"
  | "cap_plate"
  | "sole_plate"
  | "engineered_lumber"
  | "truss"
  | "purlin"
  | "girt"
  | "post"
  | "girder";

export interface WallPolyline extends GeoEntity {
  type: "wall";
  points: Point[];
  wallType?: string;
  thickness?: number;
  height?: number;
  properties: {
    centerline: boolean;
    exterior: boolean;
    length: number; // in drawing units
    connectedWalls: string[]; // IDs of connected walls
  };
}

export interface Opening extends GeoEntity {
  type: "opening";
  openingType: "door" | "window" | "opening";
  center: Point;
  width: number; // in drawing units
  height: number; // in drawing units
  properties: {
    mark?: string;
    scheduleRef?: string;
    swing?: "left" | "right" | "double" | "sliding";
    rough_opening?: {
      width: number;
      height: number;
    };
  };
}

export interface GridLine extends GeoEntity {
  type: "grid";
  gridType: "column" | "row";
  label: string; // e.g., "A", "1"
  line: {
    start: Point;
    end: Point;
  };
  properties: {
    spacing?: number;
    gridSystem?: string;
  };
}

export interface Dimension extends GeoEntity {
  type: "dimension";
  value: number; // in drawing units
  units: string;
  line: {
    start: Point;
    end: Point;
  };
  textLocation: Point;
  properties: {
    dimensionType: "linear" | "angular" | "radial";
    precision: number;
  };
}

export interface FramingMember extends GeoEntity {
  type: "framing_member";
  memberType: "joist" | "rafter" | "beam" | "column" | "brace";
  centerline: Point[];
  size?: string;
  spacing?: number;
  properties: {
    span?: number;
    direction?: number; // degrees
    material?: string;
    grade?: string;
    systemId?: string; // links to JoistSystem/RoofFraming
  };
}

export interface SymbolRef extends GeoEntity {
  type: "symbol";
  symbolType: string;
  center: Point;
  rotation?: number;
  scale?: number;
  properties: {
    mark?: string;
    description?: string;
    scheduleRef?: string;
    symbolLibrary?: string;
  };
}

export interface DrawingAnalysis {
  documentId: string;
  pages: DrawingPage[];
  globalEntities: GeoEntity[]; // entities that span multiple pages
  confidence: number;
  flags: DrawingFlag[];
  processedAt: Date;
  processingTime: number; // milliseconds
}

export interface DrawingFlag {
  type: DrawingFlagType;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  pageNumber?: number;
  entityId?: string;
  evidenceBox?: BoundingBox;
  resolved: boolean;
}

export type DrawingFlagType =
  | "SCALE_NOT_FOUND"
  | "INCONSISTENT_SCALE"
  | "POOR_IMAGE_QUALITY"
  | "OVERLAPPING_ENTITIES"
  | "DISCONNECTED_WALLS"
  | "MISSING_DIMENSIONS"
  | "SYMBOL_NOT_RECOGNIZED"
  | "GRID_INCONSISTENT"
  | "COORDINATE_MISMATCH"
  | "INCONSISTENT_MATERIAL_SPEC"
  | "MISSING_WALL_TYPE"
  | "MISSING_HEADER_SPEC"
  | "MISSING_LOAD_RATING";

// Enrichment Module Interface
export interface EnrichmentModule {
  name: string;
  process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<EnrichmentResult>;
}

export interface EnrichmentResult {
  enrichedLineItems: TakeoffLineItem[];
  flags: TakeoffFlag[];
  confidence: number;
}

// Enhanced structural member interfaces
export interface JoistEntity extends GeoEntity {
  type: "joist";
  joistType: "floor" | "ceiling" | "roof";
  size: string;
  spacing: number;
  span: number;
  properties: {
    species: string;
    grade: string;
    treatment?: string;
    engineeredType?: "I-joist" | "LVL" | "LSL" | "PSL" | "solid_sawn";
    hangerType?: string;
    hangerSize?: string;
    blockingSpacing?: number;
    bridgingType?: string;
    bridgingSpacing?: number;
    bearingLength: number;
    cantilever?: number;
    loadType: "residential" | "commercial" | "industrial";
    liveLoad?: number;
    deadLoad?: number;
  };
}

export interface RafterEntity extends GeoEntity {
  type: "rafter";
  rafterType: "common" | "hip" | "valley" | "jack" | "ridge";
  size: string;
  spacing: number;
  span: number;
  properties: {
    species: string;
    grade: string;
    treatment?: string;
    engineeredType?: "I-joist" | "LVL" | "LSL" | "PSL" | "solid_sawn";
    pitch: number;
    overhang: number;
    ridgeBoard?: string;
    collarTies?: string;
    rafterTies?: string;
    hangerType?: string;
    hangerSize?: string;
    bearingLength: number;
    birdsCut?: boolean;
    plumbCut?: boolean;
    loadType: "snow" | "wind" | "seismic" | "standard";
    snowLoad?: number;
    windLoad?: number;
  };
}

export interface BeamEntity extends GeoEntity {
  type: "beam";
  beamType: "header" | "girder" | "ridge" | "collar" | "tie";
  size: string;
  span: number;
  properties: {
    species: string;
    grade: string;
    treatment?: string;
    engineeredType?: "glulam" | "LVL" | "LSL" | "PSL" | "solid_sawn" | "steel";
    plyCount?: number;
    bearingLength: number;
    connectionType?: string;
    hangerType?: string;
    hangerSize?: string;
    loadType: "point" | "distributed" | "uniform";
    designLoad?: number;
    deflectionLimit?: string;
  };
}

export interface BlockingEntity extends GeoEntity {
  type: "blocking";
  blockingType: "solid" | "cross" | "metal" | "composite";
  size: string;
  spacing: number;
  properties: {
    species: string;
    grade: string;
    treatment?: string;
    purpose: "fire" | "structural" | "thermal" | "acoustic";
    fireRating?: string;
    installationMethod: "between_joists" | "under_joists" | "over_joists";
    fastenerType: string;
    fastenerSize: string;
    fastenerSpacing: string;
  };
}

export interface HangerEntity extends GeoEntity {
  type: "hanger";
  hangerType: "joist_hanger" | "beam_hanger" | "post_anchor" | "strap" | "tie";
  size: string;
  properties: {
    material: "galvanized_steel" | "stainless_steel" | "plain_steel";
    loadRating: number;
    memberSize: string;
    fastenerType: string;
    fastenerQuantity: number;
    seismicRated: boolean;
    windRated: boolean;
    manufacturer?: string;
    model?: string;
    installationNotes?: string;
  };
}

// Processing diagnostics types
export interface ProcessingMeta {
  traceId: string;
  steps?: Array<{ id: string; status: "ok" | "failed"; elapsedMs?: number; lastError?: string }>;
}

 export interface StepTraceEvent {
   type: "session_start" | "attempt_start" | "attempt_error" | "attempt_success" | "session_end";
   stepId?: string;
   attempt?: number;
   message?: string;
   retryable?: boolean;
   timestamp: string;
   latencyMs?: number;
   error?: string;
   traceId: string;
 }
 
 // Expert decision system types
 export interface DecisionRecord {
   id: string;
   itemId: string;
   field: string; // e.g., "material.spec", "material.plyCount"
   from?: any;
   to: any;
   confidence: number; // 0-1
   rationale: string;
   sheets: string[];
   timestamp: string; // ISO string
   refs?: EvidenceReference[];
 }

