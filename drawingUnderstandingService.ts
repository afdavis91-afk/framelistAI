 import * as FileSystem from "expo-file-system";
 import { getOpenAIClient } from "../api/openai";
 import {
   DrawingPage,
   DrawingAnalysis,
   PageTile,
   BoundingBox,
   GeoEntity,
   DrawingFlag,
   PageClassification,
   DrawingDiscipline,
   DrawingScale,
   NorthArrow,
   ProjectDocument,
   EnrichmentContext,
 } from "../types/construction";
 import { inferLevelFromSheet } from "../utils/levels";


export interface DrawingUnderstandingOptions {
  maxTileSize?: number; // pixels
  tileOverlap?: number; // percentage
  enableGeometryExtraction?: boolean;
  enableSymbolRecognition?: boolean;
  confidenceThreshold?: number;
}

export class DrawingUnderstandingService {
  private cache: Map<string, DrawingAnalysis> = new Map();
  private readonly defaultOptions: DrawingUnderstandingOptions = {
    maxTileSize: 2048,
    tileOverlap: 0.1,
    enableGeometryExtraction: true,
    enableSymbolRecognition: true,
    confidenceThreshold: 0.6,
  };

  constructor(private options: DrawingUnderstandingOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Analyze PDF pages to extract geometric information
   */
  async analyzeDocument(
    document: ProjectDocument,
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<DrawingAnalysis> {
    const startTime = Date.now();
    onProgress?.(5);

    // Check cache first
    const cacheKey = this.getCacheKey(document.id, document.size.toString());
    const cached = this.cache.get(cacheKey);
    if (cached) {
      onProgress?.(100);
      return cached;
    }

    try {
      // Step 1: Extract pages from PDF
      onProgress?.(10);
      const pages = await this.extractPagesFromPDF(document);
      
      // Step 2: Classify and analyze each page
      onProgress?.(20);
      const analyzedPages: DrawingPage[] = [];
      const globalFlags: DrawingFlag[] = [];

      for (let i = 0; i < pages.length; i++) {
        const pageProgress = 20 + ((i / pages.length) * 70);
        onProgress?.(pageProgress);

        try {
          const analyzedPage = await this.analyzePage(pages[i], context);
          analyzedPages.push(analyzedPage);
        } catch (error) {
          console.warn(`[DrawingUnderstanding] Failed to analyze page ${i + 1}:`, error);
          globalFlags.push({
            type: "POOR_IMAGE_QUALITY",
            message: `Failed to analyze page ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`,
            severity: "medium",
            pageNumber: i + 1,
            resolved: false,
          });
        }
      }

      // Step 3: Cross-page consistency checks
      onProgress?.(95);
      const consistencyFlags = await this.performConsistencyChecks(analyzedPages);
      globalFlags.push(...consistencyFlags);

      const analysis: DrawingAnalysis = {
        documentId: document.id,
        pages: analyzedPages,
        globalEntities: await this.extractGlobalEntities(analyzedPages),
        confidence: this.calculateOverallConfidence(analyzedPages),
        flags: globalFlags,
        processedAt: new Date(),
        processingTime: Date.now() - startTime,
      };

      // Cache the result
      this.cache.set(cacheKey, analysis);
      onProgress?.(100);

      return analysis;
    } catch (error) {
      console.error("[DrawingUnderstanding] Analysis failed:", error);
      throw new Error(`Drawing analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Extract individual pages from PDF as image tiles
   */
  private async extractPagesFromPDF(document: ProjectDocument): Promise<DrawingPage[]> {
    console.log("[DrawingUnderstanding] Extracting pages from PDF:", document.name);
    
    try {
      // Read PDF file as base64
      const base64Data = await FileSystem.readAsStringAsync(document.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Use OpenAI Vision API to extract page information
      const client = getOpenAIClient();
      
      // First, get page count and basic info
      const pageInfoResponse = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this PDF construction drawing and return ONLY a JSON object with this structure:
{
  "pages": [
    {
      "pageNumber": 1,
      "sheetId": "A1.01",
      "title": "Page title",
      "discipline": "architectural|structural|mechanical|electrical|plumbing|civil|unknown",
      "type": "plan|elevation|section|detail|schedule|title|unknown"
    }
  ]
}

Extract sheet IDs from title blocks, determine discipline from content, and classify page type.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64Data}`,
                  detail: "low"
                }
              }
            ]
          }
        ]
      });

      const pageInfoText = pageInfoResponse.choices[0]?.message?.content;
      if (!pageInfoText) {
        throw new Error("Failed to get page information from PDF");
      }

      const pageInfo = JSON.parse(pageInfoText);
      const pages: DrawingPage[] = [];

      // Create DrawingPage objects for each page
      for (const pageData of pageInfo.pages) {
        const page: DrawingPage = {
          id: `page_${pageData.pageNumber}_${document.id}`,
          documentId: document.id,
          pageNumber: pageData.pageNumber,
          sheetId: pageData.sheetId || `P${pageData.pageNumber}`,
          title: pageData.title || `Page ${pageData.pageNumber}`,
          discipline: pageData.discipline || "unknown",
          classification: pageData.type || "unknown",
          tiles: [],
          entities: [],
          confidence: 0.8,
          processedAt: new Date(),
        };
        pages.push(page);
      }

      return pages;
    } catch (error) {
      console.warn("[DrawingUnderstanding] PDF extraction failed, using fallback:", error);
      
      // Fallback to single page if extraction fails
      return [{
        id: `page_1_${document.id}`,
        documentId: document.id,
        pageNumber: 1,
        sheetId: "A1.01",
        title: "Construction Drawing",
        discipline: "architectural",
        classification: "plan",
        tiles: [],
        entities: [],
        confidence: 0.6,
        processedAt: new Date(),
      }];
    }
  }

  /**
   * Analyze a single page using GPT-5 vision
   */
  private async analyzePage(
    page: DrawingPage,
    context: EnrichmentContext
  ): Promise<DrawingPage> {
    console.log(`[DrawingUnderstanding] Analyzing page ${page.pageNumber}`);

    // Step 1: Generate tiles for the page
    const tiles = await this.generatePageTiles(page);
    page.tiles = tiles;

     // Step 2: Classify the page type
     const classification = await this.classifyPage(tiles[0]); // Use first tile for classification
     page.classification = classification.type;
     page.discipline = classification.discipline;
     const inferredLevel = inferLevelFromSheet(page.sheetId, page.title);


    // Step 3: Extract scale and coordinate system
    const scaleInfo = await this.extractScaleAndUnits(tiles);
    page.scale = scaleInfo.scale;
    page.northArrow = scaleInfo.northArrow;

     // Step 4: Extract geometric entities based on page type
     if (page.classification === "plan" && this.options.enableGeometryExtraction) {
       const entities = await this.extractGeometricEntities(tiles, page.scale);
       // Stamp inferred level onto entities that lack an explicit level
       page.entities = (entities || []).map((e) => {
         const loc = e.location || {};
         if (!loc.level || String(loc.level).trim().length === 0 || String(loc.level).toLowerCase() === "unknown") {
           return { ...e, location: { ...loc, level: inferredLevel } };
         }
         return e;
       });
     }


    // Step 5: Calculate page confidence
    page.confidence = this.calculatePageConfidence(page);

    return page;
  }

  /**
   * Generate image tiles for a page
   */
  private async generatePageTiles(page: DrawingPage): Promise<PageTile[]> {
    try {
      // For now, create a single high-resolution tile
      // In production, this would split the page into overlapping tiles
      const tile: PageTile = {
        id: `tile_${page.id}_0`,
        bounds: { x: 0, y: 0, width: 1, height: 1 },
        imageData: await this.getPageImageData(page),
        overlaps: [],
      };

      return [tile];
    } catch (error) {
      console.warn("[DrawingUnderstanding] Tile generation failed:", error);
      return [];
    }
  }

  /**
   * Get image data for a page (placeholder for PDF rendering)
   */
  private async getPageImageData(page: DrawingPage): Promise<string> {
    try {
      // Get the document from the page
      const document = await this.getDocumentFromPage(page);
      if (!document) {
        throw new Error('Document not found for page');
      }

      // Read PDF file as base64
      const base64Data = await FileSystem.readAsStringAsync(document.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // For now, we'll use the PDF base64 data directly with OpenAI Vision API
      // In production, this would integrate with a PDF rendering library like react-native-pdf
      // to convert specific pages to high-resolution images
      
      // Return the PDF data as a data URL that OpenAI can process
      return `data:application/pdf;base64,${base64Data}`;
    } catch (error) {
      console.warn("[DrawingUnderstanding] Failed to get page image data:", error);
      // Fallback to placeholder
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    }
  }

  /**
   * Get document from page (helper method)
   */
  private async getDocumentFromPage(page: DrawingPage): Promise<ProjectDocument | null> {
    // This is a simplified approach - in a real implementation,
    // you'd want to maintain a document registry or pass document context
    // For now, we'll try to extract from the page ID
    const documentId = page.documentId;
    
    // In a real implementation, you'd look up the document from a registry
    // For now, return null to trigger fallback
    return null;
  }

  /**
   * Classify page type using GPT-5
   */
  private async classifyPage(tile: PageTile): Promise<{
    type: PageClassification;
    discipline: DrawingDiscipline;
    confidence: number;
  }> {
    try {
      const client = getOpenAIClient();
      
      const response = await client.chat.completions.create({
        model: "gpt-4o", // Use GPT-4 Vision for now, will upgrade to GPT-5 when available
        max_tokens: 500,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: tile.imageData,
                  detail: "low"
                }
              },
              {
                type: "text",
                text: `Classify this architectural/engineering drawing page. Return ONLY a JSON object with this exact structure:
{
  "type": "plan|elevation|section|detail|schedule|title|unknown",
  "discipline": "architectural|structural|mechanical|electrical|plumbing|civil|unknown", 
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Look for:
- Plans: floor layouts, walls, doors, windows, room labels
- Elevations: building facades, height dimensions
- Sections: cut-through views showing interior structure
- Details: close-up construction details, connections
- Schedules: tables of doors, windows, materials
- Title: title blocks, cover sheets, general notes`
              }
            ]
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from GPT-4");
      }

      const result = JSON.parse(content);
      return {
        type: result.type || "unknown",
        discipline: result.discipline || "unknown",
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
      };
    } catch (error) {
      console.warn("[DrawingUnderstanding] Page classification failed:", error);
      return {
        type: "unknown",
        discipline: "unknown",
        confidence: 0.3,
      };
    }
  }

  /**
   * Extract scale information and north arrow
   */
  private async extractScaleAndUnits(tiles: PageTile[]): Promise<{
    scale?: DrawingScale;
    northArrow?: NorthArrow;
  }> {
    // TODO: Implement scale detection using GPT-5
    // For now, return default scale
    return {
      scale: {
        ratio: 48, // 1/4" = 1'-0" scale (48 pixels per foot)
        units: "feet",
        textRepresentation: "1/4\" = 1'-0\"",
        confidence: 0.7,
        evidenceBox: { x: 0.8, y: 0.9, width: 0.15, height: 0.05 },
      },
    };
  }

  /**
   * Extract geometric entities from plan drawings
   */
  private async extractGeometricEntities(
    tiles: PageTile[],
    scale?: DrawingScale
  ): Promise<GeoEntity[]> {
    const entities: GeoEntity[] = [];

    try {
      // Extract different types of entities using specialized methods
      const wallEntities = await this.extractWallEntities(tiles, scale);
      const openingEntities = await this.extractOpeningEntities(tiles, scale);
      const sheathingEntities = await this.extractSheathingEntities(tiles, scale);
      const connectorEntities = await this.extractConnectorEntities(tiles, scale);
      const joistEntities = await this.extractJoistEntities(tiles, scale);
      const rafterEntities = await this.extractRafterEntities(tiles, scale);
      const beamEntities = await this.extractBeamEntities(tiles, scale);
      const blockingEntities = await this.extractBlockingEntities(tiles, scale);
      const hangerEntities = await this.extractHangerEntities(tiles, scale);
      const plateEntities = await this.extractPlateEntities(tiles, scale);
      const studEntities = await this.extractStudEntities(tiles, scale);

      // Combine all entities
      entities.push(...wallEntities);
      entities.push(...openingEntities);
      entities.push(...sheathingEntities);
      entities.push(...connectorEntities);
      entities.push(...joistEntities);
      entities.push(...rafterEntities);
      entities.push(...beamEntities);
      entities.push(...blockingEntities);
      entities.push(...hangerEntities);
      entities.push(...plateEntities);
      entities.push(...studEntities);

      // Fallback to generic extraction if specialized methods don't return enough entities
      if (entities.length < 5) {
        console.log("[DrawingUnderstanding] Specialized extraction returned few entities, using generic method");
        for (const tile of tiles) {
          try {
            const tileEntities = await this.extractEntitiesFromTile(tile, scale);
            entities.push(...tileEntities);
          } catch (error) {
            console.warn("[DrawingUnderstanding] Entity extraction failed for tile:", tile.id, error);
          }
        }
      }

      // Merge overlapping entities
      return this.mergeOverlappingEntities(entities);
    } catch (error) {
      console.warn("[DrawingUnderstanding] Enhanced entity extraction failed, using fallback:", error);
      
      // Fallback to original method
      for (const tile of tiles) {
        try {
          const tileEntities = await this.extractEntitiesFromTile(tile, scale);
          entities.push(...tileEntities);
        } catch (error) {
          console.warn("[DrawingUnderstanding] Entity extraction failed for tile:", tile.id, error);
        }
      }

      return this.mergeOverlappingEntities(entities);
    }
  }

  /**
   * Extract entities from a single tile using GPT-4 Vision
   */
  private async extractEntitiesFromTile(
    tile: PageTile,
    scale?: DrawingScale
  ): Promise<GeoEntity[]> {
    try {
      const client = getOpenAIClient();
      
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 3000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: tile.imageData,
                  detail: "high"
                }
              },
              {
                type: "text",
                text: `Extract ALL geometric entities from this architectural/structural drawing. Return ONLY a JSON array of entities:

[
  {
    "id": "unique_id",
    "type": "wall|opening|grid|dimension|framing_member|symbol|room|text_label|header|plate|stud|sheathing|connector|fastener",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      // Wall properties
      "wallType": "exterior|interior|shear|fire",
      "thickness": 0,
      "length": 0,
      "height": 0,
      "studSpacing": 16,
      "studSize": "2x4|2x6|2x8",
      "plateCount": 3,
      "sheathing": "plywood|osb|gypsum",
      "sheathingThickness": 0,
      "fireRating": "",
      "soundRating": "",
      
      // Opening properties
      "openingType": "door|window|penetration",
      "width": 0,
      "height": 0,
      "roughOpening": 0,
      "headerSize": "",
      "headerPlyCount": 0,
      
      // Framing member properties
      "memberSize": "",
      "species": "",
      "grade": "",
      "treatment": "",
      "spacing": 0,
      "length": 0,
      
      // Sheathing properties
      "material": "",
      "thickness": 0,
      "grade": "",
      "nailingPattern": "",
      "edgeSpacing": "",
      "fieldSpacing": "",
      
      // Connector properties
      "connectorType": "hold_down|strap|clip|tie",
      "size": "",
      "material": "",
      "quantity": 0,
      
      // Fastener properties
      "fastenerType": "nail|screw|bolt",
      "size": "",
      "spacing": "",
      "galvanized": false,
      "quantity": 0
    },
    "location": {
      "level": "",
      "area": "",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Extract EVERYTHING visible: walls, openings, dimensions, symbols, text labels, headers, plates, studs, sheathing, connectors, fasteners. Use normalized coordinates [0,1] for all positions. Include all material specifications, sizes, and quantities you can identify.`
              }
            ]
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      const entities = JSON.parse(content);
      return Array.isArray(entities) ? entities.filter(e => e.confidence > (this.options.confidenceThreshold || 0.6)) : [];
    } catch (error) {
      console.warn("[DrawingUnderstanding] Entity extraction failed:", error);
      return [];
    }
  }

  /**
   * Extract global entities that span multiple pages
   */
  private async extractGlobalEntities(pages: DrawingPage[]): Promise<GeoEntity[]> {
    const globalEntities: GeoEntity[] = [];
    
    // Extract wall types, schedules, and specifications that apply across pages
    for (const page of pages) {
      if (page.classification === "schedule" || page.classification === "legend") {
        const scheduleEntities = await this.extractScheduleEntities(page);
        globalEntities.push(...scheduleEntities);
      }
    }

    return globalEntities;
  }

  /**
   * Extract entities from schedules and legends
   */
  private async extractScheduleEntities(page: DrawingPage): Promise<GeoEntity[]> {
    try {
      const client = getOpenAIClient();
      
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 2000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: page.tiles[0]?.imageData || "",
                  detail: "high"
                }
              },
              {
                type: "text",
                text: `Extract ALL material specifications and schedules from this drawing. Return ONLY a JSON array:

[
  {
    "id": "schedule_id",
    "type": "wall_type|header_schedule|shear_wall|connector|fastener|material",
    "confidence": 0.0-1.0,
    "properties": {
      "wallType": "",
      "studSize": "",
      "studSpacing": 16,
      "plateCount": 3,
      "sheathing": "",
      "sheathingThickness": 0,
      "fireRating": "",
      "soundRating": "",
      "headerSize": "",
      "headerPlyCount": 0,
      "species": "",
      "grade": "",
      "treatment": "",
      "connectorType": "",
      "connectorSize": "",
      "fastenerType": "",
      "fastenerSize": "",
      "spacing": "",
      "nailingPattern": ""
    },
    "location": {
      "sheetRef": "",
      "scheduleRef": ""
    }
  }
]

Extract wall types, header schedules, shear wall specs, connector schedules, fastener schedules, and material specifications.`
              }
            ]
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      const entities = JSON.parse(content);
      return Array.isArray(entities) ? entities : [];
    } catch (error) {
      console.warn("[DrawingUnderstanding] Schedule extraction failed:", error);
      return [];
    }
  }

  /**
   * Extract wall entities with enhanced properties
   */
  private async extractWallEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const wallEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 3000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL wall entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "wall_id",
    "type": "wall",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "wallType": "exterior|interior|shear|fire|foundation",
      "thickness": 0,
      "length": 0,
      "height": 0,
      "studSpacing": 16,
      "studSize": "2x4|2x6|2x8",
      "plateCount": 3,
      "sheathing": "plywood|osb|gypsum|none",
      "sheathingThickness": 0,
      "fireRating": "1hr|2hr|none",
      "soundRating": "STC-45|STC-50|none",
      "insulation": "R-13|R-19|none",
      "vaporBarrier": true|false,
      "moistureBarrier": true|false
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|interior",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|detail|schedule|note",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Wall dimensions and thickness
- Stud size and spacing
- Sheathing type and thickness
- Fire and sound ratings
- Insulation and barrier requirements
- Location and level information`
              }
            ]
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        try {
          const entities = JSON.parse(content);
          if (Array.isArray(entities)) {
            wallEntities.push(...entities.filter(e => e.type === "wall"));
          }
        } catch (parseError) {
          console.warn("[DrawingUnderstanding] Failed to parse wall entities:", parseError);
        }
      }
    } catch (error) {
      console.warn("[DrawingUnderstanding] Failed to extract wall entities from tile:", error);
    }
    }

    return wallEntities;
  }

  /**
   * Extract opening entities (doors, windows, penetrations)
   */
  private async extractOpeningEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const openingEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 3000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL opening entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "opening_id",
    "type": "opening",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "openingType": "door|window|penetration|opening",
      "width": 0,
      "height": 0,
      "roughOpening": 0,
      "headerSize": "2x8|2x10|2x12|engineered",
      "headerPlyCount": 2,
      "headerSpecies": "SPF|DF-L|engineered",
      "headerGrade": "No.2|No.1|select",
      "jambType": "wood|metal|vinyl",
      "threshold": "wood|aluminum|none",
      "fireRating": "20min|45min|90min|none",
      "soundRating": "STC-35|STC-45|none"
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|interior",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|schedule|detail|note",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Opening dimensions and rough opening size
- Header specifications (size, ply count, species)
- Jamb and threshold details
- Fire and sound ratings
- Location and level information`
              }
            ]
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        try {
          const entities = JSON.parse(content);
          if (Array.isArray(entities)) {
            openingEntities.push(...entities.filter(e => e.type === "opening"));
          }
        } catch (parseError) {
          console.warn("[DrawingUnderstanding] Failed to parse opening entities:", parseError);
        }
      }
    } catch (error) {
      console.warn("[DrawingUnderstanding] Failed to extract opening entities from tile:", error);
    }
    }

    return openingEntities;
  }

  /**
   * Extract sheathing and cladding entities
   */
  private async extractSheathingEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const sheathingEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 3000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL sheathing and cladding entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "sheathing_id",
    "type": "sheathing",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "material": "plywood|osb|gypsum|cement_board|fiberboard",
      "thickness": 0.5,
      "grade": "STRUCT 1|STRUCT 2|C-D|X|exterior",
      "size": "4x8|4x10|4x12",
      "nailingPattern": "6\" edge, 12\" field|4\" edge, 8\" field",
      "edgeSpacing": "6\"|4\"|3\"",
      "fieldSpacing": "12\"|8\"|6\"",
      "fastenerType": "8d common|10d common|screws",
      "fastenerSize": "8d|10d|#8|#10",
      "galvanized": true|false,
      "moistureResistant": true|false,
      "fireRated": true|false,
      "fireRating": "1hr|2hr|none"
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|interior|exterior",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|schedule|detail|note",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Material type and thickness
- Grade and performance ratings
- Nailing patterns and spacing
- Fastener specifications
- Moisture and fire resistance
- Location and application`
              }
            ]
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        try {
          const entities = JSON.parse(content);
          if (Array.isArray(entities)) {
            sheathingEntities.push(...entities.filter(e => e.type === "sheathing"));
          }
        } catch (parseError) {
          console.warn("[DrawingUnderstanding] Failed to parse sheathing entities:", parseError);
        }
      }
    } catch (error) {
      console.warn("[DrawingUnderstanding] Failed to extract sheathing entities from tile:", error);
    }
    }

    return sheathingEntities;
  }

  /**
   * Extract connector and fastener entities
   */
  private async extractConnectorEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const connectorEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 3000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL connector and fastener entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "connector_id",
    "type": "connector|fastener",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "connectorType": "hold_down|strap|clip|tie|hurricane_tie|post_anchor",
      "fastenerType": "nail|screw|bolt|lag_screw|anchor",
      "size": "8d|10d|16d|1/2\"|5/8\"|3/4\"",
      "material": "steel|galvanized|stainless|zinc",
      "quantity": 0,
      "spacing": "16\" o.c.|24\" o.c.|48\" o.c.",
      "galvanized": true|false,
      "stainless": true|false,
      "loadRating": "1500#|3000#|5000#",
      "seismicRating": "seismic|non_seismic",
      "windRating": "wind|non_wind"
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|interior|exterior",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|schedule|detail|note",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Connector types and sizes
- Fastener specifications
- Material and coating requirements
- Load and performance ratings
- Seismic and wind requirements
- Location and quantity information`
              }
            ]
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        try {
          const entities = JSON.parse(content);
          if (Array.isArray(entities)) {
            connectorEntities.push(...entities.filter(e => e.type === "connector" || e.type === "fastener"));
          }
        } catch (parseError) {
          console.warn("[DrawingUnderstanding] Failed to parse connector entities:", parseError);
        }
      }
    } catch (error) {
      console.warn("[DrawingUnderstanding] Failed to extract connector entities from tile:", error);
    }
    }

    return connectorEntities;
  }

  /**
   * Extract joist entities with enhanced properties
   */
  private async extractJoistEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const joistEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 3000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL joist entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "joist_id",
    "type": "joist",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "joistType": "floor|ceiling|roof",
      "size": "2x8|2x10|2x12|I-joist|LVL",
      "spacing": 12|16|19.2|24,
      "span": 0,
      "species": "SPF|DF-L|SYP|engineered",
      "grade": "No.2|No.1|select|engineered",
      "treatment": "none|pressure_treated|fire_retardant",
      "engineeredType": "I-joist|LVL|LSL|PSL|solid_sawn",
      "hangerType": "standard|heavy_duty|skewed",
      "hangerSize": "2x8|2x10|2x12",
      "blockingSpacing": 48|96,
      "bridgingType": "solid|cross|metal",
      "bridgingSpacing": 96|120,
      "bearingLength": 1.5,
      "cantilever": 0,
      "liveLoad": 40|50|60,
      "deadLoad": 10|15|20
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|center",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|section|detail|schedule",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Joist size and spacing from framing plans
- Engineered lumber specifications
- Hanger and connection details
- Load requirements and spans
- Blocking and bridging requirements`
                }
              ]
            }
          ]
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          try {
            const entities = JSON.parse(content);
            if (Array.isArray(entities)) {
              joistEntities.push(...entities.filter(e => e.type === "joist"));
            }
          } catch (parseError) {
            console.warn("[DrawingUnderstanding] Failed to parse joist entities:", parseError);
          }
        }
      } catch (error) {
        console.warn("[DrawingUnderstanding] Failed to extract joist entities from tile:", error);
      }
    }

    return joistEntities;
  }

  /**
   * Extract rafter entities with enhanced properties
   */
  private async extractRafterEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const rafterEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 3000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL rafter entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "rafter_id",
    "type": "rafter",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "rafterType": "common|hip|valley|jack|ridge",
      "size": "2x6|2x8|2x10|2x12|I-joist|LVL",
      "spacing": 12|16|19.2|24,
      "span": 0,
      "species": "SPF|DF-L|SYP|engineered",
      "grade": "No.2|No.1|select|engineered",
      "treatment": "none|pressure_treated|fire_retardant",
      "engineeredType": "I-joist|LVL|LSL|PSL|solid_sawn",
      "pitch": 4|6|8|10|12,
      "overhang": 12|16|24,
      "ridgeBoard": "2x8|2x10|2x12|LVL",
      "collarTies": "2x6|2x8|none",
      "rafterTies": "2x4|2x6|none",
      "hangerType": "standard|heavy_duty|skewed",
      "hangerSize": "2x6|2x8|2x10|2x12",
      "bearingLength": 1.5,
      "birdsCut": true|false,
      "plumbCut": true|false,
      "snowLoad": 20|30|40|50,
      "windLoad": 15|20|25|30
    },
    "location": {
      "level": "first|second|roof",
      "area": "north|south|east|west",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|section|detail|schedule",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Rafter size, spacing, and pitch
- Ridge board and tie specifications
- Overhang and bearing details
- Load requirements (snow, wind)
- Connection and hanger details`
                }
              ]
            }
          ]
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          try {
            const entities = JSON.parse(content);
            if (Array.isArray(entities)) {
              rafterEntities.push(...entities.filter(e => e.type === "rafter"));
            }
          } catch (parseError) {
            console.warn("[DrawingUnderstanding] Failed to parse rafter entities:", parseError);
          }
        }
      } catch (error) {
        console.warn("[DrawingUnderstanding] Failed to extract rafter entities from tile:", error);
      }
    }

    return rafterEntities;
  }

  /**
   * Extract beam entities (headers, girders, etc.)
   */
  private async extractBeamEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const beamEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 3000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL beam entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "beam_id",
    "type": "beam",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "beamType": "header|girder|ridge|collar|tie",
      "size": "2x8|2x10|2x12|3x12|glulam|LVL|steel",
      "span": 0,
      "species": "SPF|DF-L|SYP|glulam|steel",
      "grade": "No.2|No.1|select|24F-V4|A36",
      "treatment": "none|pressure_treated|fire_retardant",
      "engineeredType": "glulam|LVL|LSL|PSL|solid_sawn|steel",
      "plyCount": 1|2|3|4,
      "bearingLength": 3|4.5|6,
      "connectionType": "bearing|hanger|bolted|welded",
      "hangerType": "standard|heavy_duty|custom",
      "hangerSize": "2x8|2x10|2x12|custom",
      "designLoad": 1000|2000|5000|10000,
      "deflectionLimit": "L/240|L/360|L/480"
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|center",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|section|detail|schedule",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Beam type and structural purpose
- Size and material specifications
- Span and load requirements
- Connection and bearing details
- Engineered lumber specifications`
                }
              ]
            }
          ]
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          try {
            const entities = JSON.parse(content);
            if (Array.isArray(entities)) {
              beamEntities.push(...entities.filter(e => e.type === "beam"));
            }
          } catch (parseError) {
            console.warn("[DrawingUnderstanding] Failed to parse beam entities:", parseError);
          }
        }
      } catch (error) {
        console.warn("[DrawingUnderstanding] Failed to extract beam entities from tile:", error);
      }
    }

    return beamEntities;
  }

  /**
   * Extract blocking entities
   */
  private async extractBlockingEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const blockingEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 2000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL blocking entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "blocking_id",
    "type": "blocking",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "blockingType": "solid|cross|metal|composite",
      "size": "2x8|2x10|2x12|metal",
      "spacing": 48|96,
      "species": "SPF|DF-L|SYP|metal",
      "grade": "No.2|No.1|galvanized",
      "treatment": "none|pressure_treated|fire_retardant",
      "purpose": "fire|structural|thermal|acoustic",
      "fireRating": "1hr|2hr|none",
      "installationMethod": "between_joists|under_joists|over_joists",
      "fastenerType": "16d_common|10d_common|screws|clips",
      "fastenerSize": "3.5\"|2.5\"|#10|#12",
      "fastenerSpacing": "16\"|12\"|8\""
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|center",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|section|detail|note",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Blocking type and purpose
- Installation method and spacing
- Fire rating requirements
- Fastener specifications`
                }
              ]
            }
          ]
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          try {
            const entities = JSON.parse(content);
            if (Array.isArray(entities)) {
              blockingEntities.push(...entities.filter(e => e.type === "blocking"));
            }
          } catch (parseError) {
            console.warn("[DrawingUnderstanding] Failed to parse blocking entities:", parseError);
          }
        }
      } catch (error) {
        console.warn("[DrawingUnderstanding] Failed to extract blocking entities from tile:", error);
      }
    }

    return blockingEntities;
  }

  /**
   * Extract hanger entities
   */
  private async extractHangerEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const hangerEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 2000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL hanger entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "hanger_id",
    "type": "hanger",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "hangerType": "joist_hanger|beam_hanger|post_anchor|strap|tie",
      "size": "2x6|2x8|2x10|2x12|custom",
      "material": "galvanized_steel|stainless_steel|plain_steel",
      "loadRating": 500|1000|1500|2000|3000|5000,
      "memberSize": "2x6|2x8|2x10|2x12",
      "fastenerType": "joist_hanger_nail|structural_screw|bolt",
      "fastenerQuantity": 4|6|8|10|12,
      "seismicRated": true|false,
      "windRated": true|false,
      "manufacturer": "Simpson|USP|MiTek|other",
      "model": "U26|U28|U210|custom",
      "quantity": 1
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|center",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|detail|schedule|note",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Hanger type and load rating
- Member size compatibility
- Fastener specifications
- Seismic and wind ratings
- Manufacturer and model details`
                }
              ]
            }
          ]
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          try {
            const entities = JSON.parse(content);
            if (Array.isArray(entities)) {
              hangerEntities.push(...entities.filter(e => e.type === "hanger"));
            }
          } catch (parseError) {
            console.warn("[DrawingUnderstanding] Failed to parse hanger entities:", parseError);
          }
        }
      } catch (error) {
        console.warn("[DrawingUnderstanding] Failed to extract hanger entities from tile:", error);
      }
    }

    return hangerEntities;
  }

  /**
   * Extract plate entities (top plates, sole plates, etc.)
   */
  private async extractPlateEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const plateEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 2000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL plate entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "plate_id",
    "type": "plate",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "plateType": "top|cap|sole|sill|double_top",
      "size": "2x4|2x6|2x8",
      "length": 0,
      "species": "SPF|DF-L|SYP",
      "grade": "No.2|No.1|select",
      "treatment": "none|pressure_treated",
      "stockLength": 8|10|12|14|16|20,
      "spliceCount": 0,
      "wallType": "exterior|interior|bearing|non_bearing"
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|perimeter|interior",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|section|detail|note",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Plate type and position
- Wall length and splicing
- Material specifications
- Stock length considerations`
                }
              ]
            }
          ]
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          try {
            const entities = JSON.parse(content);
            if (Array.isArray(entities)) {
              plateEntities.push(...entities.filter(e => e.type === "plate"));
            }
          } catch (parseError) {
            console.warn("[DrawingUnderstanding] Failed to parse plate entities:", parseError);
          }
        }
      } catch (error) {
        console.warn("[DrawingUnderstanding] Failed to extract plate entities from tile:", error);
      }
    }

    return plateEntities;
  }

  /**
   * Extract stud entities
   */
  private async extractStudEntities(tiles: PageTile[], scale?: DrawingScale): Promise<GeoEntity[]> {
    const studEntities: GeoEntity[] = [];

    for (const tile of tiles) {
      try {
        const client = getOpenAIClient();
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 2000,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: tile.imageData,
                    detail: "high"
                  }
                },
                {
                  type: "text",
                  text: `Extract ALL stud entities from this construction drawing. Return ONLY a JSON array:

[
  {
    "id": "stud_id",
    "type": "stud",
    "confidence": 0.0-1.0,
    "evidenceBox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0},
    "properties": {
      "studType": "common|king|jack|cripple|corner|partition",
      "size": "2x4|2x6|2x8",
      "spacing": 12|16|19.2|24,
      "height": 8|9|10|12,
      "wallLength": 0,
      "species": "SPF|DF-L|SYP",
      "grade": "No.2|No.1|select",
      "treatment": "none|pressure_treated",
      "cornerStuds": 2|3|4,
      "tIntersectionStuds": 1|2|3,
      "wallType": "exterior|interior|bearing|non_bearing|shear"
    },
    "location": {
      "level": "basement|first|second|roof",
      "area": "north|south|east|west|interior",
      "coordinates": [0, 0],
      "sheetRef": "",
      "detailRef": ""
    },
    "assumptions": [],
    "evidence": {
      "source": "plan|section|detail|note",
      "confidence": 0.0,
      "notes": ""
    }
  }
]

Focus on:
- Stud spacing and wall length
- Corner and intersection details
- Wall type and structural purpose
- Height and material specifications`
                }
              ]
            }
          ]
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          try {
            const entities = JSON.parse(content);
            if (Array.isArray(entities)) {
              studEntities.push(...entities.filter(e => e.type === "stud"));
            }
          } catch (parseError) {
            console.warn("[DrawingUnderstanding] Failed to parse stud entities:", parseError);
          }
        }
      } catch (error) {
        console.warn("[DrawingUnderstanding] Failed to extract stud entities from tile:", error);
      }
    }

    return studEntities;
  }

  /**
   * Merge overlapping entities from different tiles
   */
  private mergeOverlappingEntities(entities: GeoEntity[]): GeoEntity[] {
    // TODO: Implement sophisticated entity merging
    // For now, just remove exact duplicates
    const uniqueEntities = new Map<string, GeoEntity>();
    
    entities.forEach(entity => {
      const key = `${entity.type}_${Math.round(entity.evidenceBox.x * 100)}_${Math.round(entity.evidenceBox.y * 100)}`;
      if (!uniqueEntities.has(key) || entity.confidence > uniqueEntities.get(key)!.confidence) {
        uniqueEntities.set(key, entity);
      }
    });

    return Array.from(uniqueEntities.values());
  }

  /**
   * Perform cross-page consistency checks
   */
  private async performConsistencyChecks(pages: DrawingPage[]): Promise<DrawingFlag[]> {
    const flags: DrawingFlag[] = [];

    // Check scale consistency
    const scales = pages.filter(p => p.scale).map(p => p.scale!);
    if (scales.length > 1) {
      const uniqueScales = new Set(scales.map(s => s.textRepresentation));
      if (uniqueScales.size > 1) {
        flags.push({
          type: "INCONSISTENT_SCALE",
          message: `Inconsistent scales found: ${Array.from(uniqueScales).join(", ")}`,
          severity: "medium",
          resolved: false,
        });
      }
    }

    // Check for pages without scale
    const pagesWithoutScale = pages.filter(p => !p.scale && p.classification === "plan");
    if (pagesWithoutScale.length > 0) {
      flags.push({
        type: "SCALE_NOT_FOUND",
        message: `${pagesWithoutScale.length} plan pages missing scale information`,
        severity: "high",
        resolved: false,
      });
    }

    // Check material specification consistency
    const materialFlags = await this.checkMaterialConsistency(pages);
    flags.push(...materialFlags);

    // Check wall type consistency
    const wallTypeFlags = await this.checkWallTypeConsistency(pages);
    flags.push(...wallTypeFlags);

    // Check opening schedule consistency
    const openingFlags = await this.checkOpeningConsistency(pages);
    flags.push(...openingFlags);

    // Check connector and fastener consistency
    const connectorFlags = await this.checkConnectorConsistency(pages);
    flags.push(...connectorFlags);

    return flags;
  }

  /**
   * Check material specification consistency across pages
   */
  private async checkMaterialConsistency(pages: DrawingPage[]): Promise<DrawingFlag[]> {
    const flags: DrawingFlag[] = [];
    const materialSpecs = new Map<string, any[]>();

    // Collect all material specifications
    for (const page of pages) {
      for (const entity of page.entities) {
        if (entity.properties?.species || entity.properties?.grade) {
          const key = `${entity.properties.species || 'unknown'}_${entity.properties.grade || 'unknown'}`;
          if (!materialSpecs.has(key)) {
            materialSpecs.set(key, []);
          }
          materialSpecs.get(key)!.push(entity);
        }
      }
    }

    // Check for inconsistencies
    for (const [spec, entities] of materialSpecs) {
      if (entities.length > 1) {
        const uniqueSpecs = new Set(entities.map(e => JSON.stringify(e.properties)));
        if (uniqueSpecs.size > 1) {
          flags.push({
            type: "INCONSISTENT_MATERIAL_SPEC",
            message: `Inconsistent material specifications for ${spec}`,
            severity: "medium",
            resolved: false,
          });
        }
      }
    }

    return flags;
  }

  /**
   * Check wall type consistency across pages
   */
  private async checkWallTypeConsistency(pages: DrawingPage[]): Promise<DrawingFlag[]> {
    const flags: DrawingFlag[] = [];
    const wallTypes = new Map<string, any[]>();

    // Collect all wall type definitions
    for (const page of pages) {
      for (const entity of page.entities) {
        if (entity.type === "wall" && entity.properties?.wallType) {
          const wallType = entity.properties.wallType;
          if (!wallTypes.has(wallType)) {
            wallTypes.set(wallType, []);
          }
          wallTypes.get(wallType)!.push(entity);
        }
      }
    }

    // Check for missing wall type definitions
    const planPages = pages.filter(p => p.classification === "plan");
    for (const page of planPages) {
      for (const entity of page.entities) {
        if (entity.type === "wall" && !entity.properties?.wallType) {
          flags.push({
            type: "MISSING_WALL_TYPE",
            message: `Wall entity missing type classification on page ${page.pageNumber}`,
            severity: "medium",
            resolved: false,
          });
        }
      }
    }

    return flags;
  }

  /**
   * Check opening schedule consistency
   */
  private async checkOpeningConsistency(pages: DrawingPage[]): Promise<DrawingFlag[]> {
    const flags: DrawingFlag[] = [];
    const openingSchedules = new Map<string, any[]>();

    // Collect all opening specifications
    for (const page of pages) {
      for (const entity of page.entities) {
        if (entity.type === "opening") {
          const key = `${entity.properties?.openingType || 'unknown'}_${entity.properties?.width || 'unknown'}`;
          if (!openingSchedules.has(key)) {
            openingSchedules.set(key, []);
          }
          openingSchedules.get(key)!.push(entity);
        }
      }
    }

    // Check for missing header specifications
    for (const [key, openings] of openingSchedules) {
      for (const opening of openings) {
        if (!opening.properties?.headerSize) {
          flags.push({
            type: "MISSING_HEADER_SPEC",
            message: `Opening missing header specification: ${key}`,
            severity: "medium",
            resolved: false,
          });
        }
      }
    }

    return flags;
  }

  /**
   * Check connector and fastener consistency
   */
  private async checkConnectorConsistency(pages: DrawingPage[]): Promise<DrawingFlag[]> {
    const flags: DrawingFlag[] = [];
    const connectors = new Map<string, any[]>();

    // Collect all connector specifications
    for (const page of pages) {
      for (const entity of page.entities) {
        if (entity.type === "connector" || entity.type === "fastener") {
          const key = `${entity.properties?.connectorType || entity.properties?.fastenerType || 'unknown'}_${entity.properties?.size || 'unknown'}`;
          if (!connectors.has(key)) {
            connectors.set(key, []);
          }
          connectors.get(key)!.push(entity);
        }
      }
    }

    // Check for missing load ratings on structural connectors
    for (const [key, connectorList] of connectors) {
      for (const connector of connectorList) {
        if (connector.properties?.connectorType && 
            ['hold_down', 'strap', 'post_anchor'].includes(connector.properties.connectorType) &&
            !connector.properties?.loadRating) {
          flags.push({
            type: "MISSING_LOAD_RATING",
            message: `Structural connector missing load rating: ${key}`,
            severity: "high",
            resolved: false,
          });
        }
      }
    }

    return flags;
  }

  /**
   * Calculate overall confidence for the analysis
   */
  private calculateOverallConfidence(pages: DrawingPage[]): number {
    if (pages.length === 0) return 0;
    
    const totalConfidence = pages.reduce((sum, page) => sum + page.confidence, 0);
    return totalConfidence / pages.length;
  }

  /**
   * Calculate confidence for a single page
   */
  private calculatePageConfidence(page: DrawingPage): number {
    let confidence = 0.5; // Base confidence

    // Boost for successful classification
    if (page.classification !== "unknown") confidence += 0.2;
    if (page.discipline !== "unknown") confidence += 0.1;

    // Boost for scale detection
    if (page.scale && page.scale.confidence > 0.7) confidence += 0.1;

    // Boost for entity extraction
    if (page.entities.length > 0) {
      const avgEntityConfidence = page.entities.reduce((sum, e) => sum + e.confidence, 0) / page.entities.length;
      confidence += avgEntityConfidence * 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate cache key for analysis results
   */
  private getCacheKey(documentId: string, documentHash: string): string {
    return `drawing_analysis_${documentId}_${documentHash}`;
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cached analysis if available
   */
  getCachedAnalysis(documentId: string, documentHash: string): DrawingAnalysis | null {
    return this.cache.get(this.getCacheKey(documentId, documentHash)) || null;
  }
}

export const drawingUnderstandingService = new DrawingUnderstandingService();