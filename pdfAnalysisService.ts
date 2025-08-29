 import * as FileSystem from "expo-file-system";
import { getAnthropicClient } from "../api/anthropic";
import { RobustJSONParser } from "../utils/jsonParser";
import {
  TakeoffLineItem,
  TakeoffFlag,
  ConstructionStandards,
  WasteRules,
  ProjectDocument,
  EnrichmentContext,
  FlagType,
  FlagSeverity,
  ConnectorSchedule,
  FastenerSchedule,
  WallType,
  ProjectInfo,
  // Add missing imports for new systems
  JoistSystem,
  RoofFraming,
  SheathingSystem,
} from "../types/construction";
import { enrichmentService } from "./enrichmentService";
import { normalizeLevel } from "../utils/levels";

// Pipeline integration imports
import { useNewLedger, loadPolicy, Ledger, createContext, appendEvidence, appendInference, appendFlag, type MaybeCtx } from "../pipeline";


export interface PDFAnalysisResult {
  lineItems: TakeoffLineItem[];
  flags: TakeoffFlag[];
  confidence: number;
  projectInfo: ProjectInfo;
  wallTypes: WallType[];
  // Enhanced schedules for comprehensive material tracking
  connectorSchedules: ConnectorSchedule[];
  fastenerSchedules: FastenerSchedule[];
  // New systems for comprehensive framing analysis
  joistSystems: JoistSystem[];
  roofFraming: RoofFraming[];
  sheathingSystems: SheathingSystem[];
}

export class PDFAnalysisService {
  private constructionStandards: ConstructionStandards;

  constructor(standards: ConstructionStandards) {
    this.constructionStandards = standards;
  }

  async analyzePDF(
    document: ProjectDocument,
    wasteRules: WasteRules,
    onProgress?: (progress: number) => void,
    projectDocuments?: ProjectDocument[],
  ): Promise<PDFAnalysisResult> {
    try {
      onProgress?.(5);

      // Initialize ledger if feature flag is enabled
      let ctx: MaybeCtx = undefined;
      if (useNewLedger()) {
        const runId = crypto.randomUUID?.() ?? String(Date.now());
        const policy = loadPolicy({ projectOverrides: undefined });
        const ledger = new Ledger({ policyId: policy.id, runId, docId: document.id });
        ctx = createContext(policy, ledger, { docId: document.id });
        
        // Log ledger initialization
        console.log(`[PDFAnalysisService] Ledger initialized for document ${document.id}, run ${runId}`);
      }

      // Read the PDF file as base64
      const base64Data = await FileSystem.readAsStringAsync(document.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Basic size guard (approximate bytes from base64): bytes ≈ length * 3/4
      const approxBytes = Math.floor((base64Data.length * 3) / 4);
      const maxBytes = 32 * 1024 * 1024; // 32MB Anthropic request limit
      if (approxBytes > maxBytes) {
        return this.safeResultWithFlags(
          "PDF exceeds API size limits; split by levels or specific sheets and re-run.",
          [document.name],
        );
      }

      onProgress?.(25);

      // Create the analysis prompt with strict JSON-only instructions
      const analysisPrompt = this.createAnalysisPrompt(document.type, wasteRules);

      onProgress?.(40);

      // Use Anthropic PDF support directly
      const client = getAnthropicClient();
      const model = "claude-sonnet-4-20250514"; // supports PDFs

      const response = await client.messages.create({
        model,
        max_tokens: 8000, // Increased from 4000 to handle larger responses
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: analysisPrompt,
              },
            ],
          },
        ],
      } as any);

      onProgress?.(70);

      // Extract concatenated text from content blocks
      const aiText = (response.content || []).reduce((acc: string, block: any) => {
        if (block && typeof block === "object" && "text" in block) {
          return acc + String((block as any).text || "");
        }
        return acc;
      }, "");

      // Append evidence for extracted text
      if (ctx?.ledger) {
        appendEvidence(ctx, {
          type: "text",
          source: {
            documentId: document.id,
            pageNumber: 1,
            extractor: "pdfAnalysisService",
            confidence: 0.9,
          },
          content: {
            text: aiText.substring(0, 1000) + (aiText.length > 1000 ? "..." : ""), // Truncate for storage
            fullLength: aiText.length,
            extractedAt: new Date().toISOString(),
          },
          metadata: {
            contentType: "ai_extracted_text",
            model: "claude-sonnet-4-20250514",
            language: "en",
          },
          timestamp: new Date().toISOString(),
          version: "1.0",
        });
      }

      onProgress?.(70);

      // Monitor response length and warn if potentially truncated
      const responseLength = aiText.length;
      const estimatedTokens = Math.ceil(responseLength / 4); // Rough estimate: 4 chars per token
      
      if (estimatedTokens > 7500) {
        console.warn(`[PDFAnalysisService] Large response detected: ~${estimatedTokens} tokens, may be truncated`);
      }
      
      if (responseLength < 100) {
        console.warn('[PDFAnalysisService] Suspiciously short response:', aiText);
      }

      // Parse the response robustly
      const baselineResult = this.parseAnalysisResponse(aiText);

      // Append evidence for baseline parse result
      if (ctx?.ledger) {
        appendEvidence(ctx, {
          type: "table",
          source: {
            documentId: document.id,
            pageNumber: 1,
            extractor: "pdfAnalysisService",
            confidence: 0.85,
          },
          content: {
            parseResult: baselineResult,
            lineItemCount: baselineResult.lineItems?.length || 0,
            flagCount: baselineResult.flags?.length || 0,
            confidence: baselineResult.confidence,
          },
          metadata: {
            contentType: "baseline_parse_result",
            parser: "RobustJSONParser",
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
          version: "1.0",
        });
      }

      onProgress?.(80);

      // Generate inferences for baseline parse
      if (ctx?.ledger && baselineResult.lineItems) {
        for (const lineItem of baselineResult.lineItems) {
          appendInference(ctx, {
            topic: "baseline_parse",
            value: lineItem,
            confidence: baselineResult.confidence || 0.7,
            method: "rule",
            usedEvidence: [], // Will be filled when we track evidence IDs
            usedAssumptions: [],
            explanation: `Baseline parse inference for ${lineItem.context?.scope || 'unknown'} item`,
            alternatives: [],
            timestamp: new Date().toISOString(),
            stage: "baseline_parse",
          });
        }
        
        // Add flag for legacy path
        appendFlag(ctx, {
          type: "MISSING_INFO",
          severity: "low",
          message: "Legacy inference recorded without resolver",
          topic: "baseline_parse",
          evidenceIds: [],
          assumptionIds: [],
          inferenceIds: [],
          timestamp: new Date().toISOString(),
        });
      }

      // Apply enrichment if we have project documents
      if (projectDocuments && projectDocuments.length > 1) {
        const enrichmentContext: EnrichmentContext = {
          projectDocuments,
          baselineAnalysis: baselineResult,
          constructionStandards: this.constructionStandards,
        };

        const enrichmentResult = await enrichmentService.enrichAnalysis(
          baselineResult.lineItems,
          enrichmentContext,
          (progress) => onProgress?.(80 + progress * 0.15),
          ctx // Pass context for ledger integration
        );

        // Merge enrichment results back into baseline
        const enrichedAnalysis = {
          ...baselineResult,
          lineItems: enrichmentResult.enrichedLineItems,
          flags: [...baselineResult.flags, ...enrichmentResult.flags],
          confidence: Math.max(baselineResult.confidence, enrichmentResult.confidence),
        };

        onProgress?.(100);

        // Persist ledger if available
        if (ctx?.ledger) {
          try {
            const { saveLedger } = await import("../pipeline");
            await saveLedger(ctx.ledger.getInferenceLedger(), document.id, ctx.ledger.getInferenceLedger().runId);
            console.log(`[PDFAnalysisService] Ledger persisted for document ${document.id}`);
          } catch (error) {
            console.warn("Failed to persist ledger:", error);
          }
        }

        return enrichedAnalysis;
      }

      onProgress?.(100);

      // Persist ledger if available
      if (ctx?.ledger) {
        try {
          const { saveLedger } = await import("../pipeline");
          await saveLedger(ctx.ledger.getInferenceLedger(), document.id, ctx.ledger.getInferenceLedger().runId);
          console.log(`[PDFAnalysisService] Ledger persisted for document ${document.id}`);
        } catch (error) {
          console.warn("Failed to persist ledger:", error);
        }
      }

      return baselineResult;
    } catch (e) {
      // Friendly fallback with flags
      return this.safeResultWithFlags(
        `Failed to analyze document: ${e instanceof Error ? e.message : "Unknown error"}`,
        [document.name],
      );
    }
  }

  private createAnalysisPrompt(documentType: string, wasteRules: WasteRules): string {
    const policy = [
      "You are a GC preconstruction framing estimator and PDF drawing analyst. Your job is to read architectural (A-series), structural (S-series), and specification PDFs and produce a defendable framing takeoff with an audit trail. Operate like a human estimator: extract required inputs from the correct sources, reconcile conflicts using source precedence, quantify only what is supported by evidence, and surface explicit flags and candidate options whenever information is missing or ambiguous. When structural plans (S-series) are missing, use intelligent reasoning to infer structural requirements from architectural plans and building code minimums.",
      "",
      "Core behaviors:",
      "- Deterministic & evidence-first: every data point must be traceable to one or more sources (sheet/detail/schedule/spec clause) and include a confidence score in [0,1]. Never invent values.",
      "- Source precedence: use the most specific source that applies: detail/callout > plan view > general note > specification. If two sources conflict, choose the higher-precedence source and add a flag describing the conflict and both references.",
      "- Scope: wood/light-framing takeoff for walls (studs, plates, headers, blocking, sheathing, connectors/anchors/hold-downs, fasteners). Exclude items explicitly \"NIC/by others\" and anything outside framing unless the provided schema/fields require it.",
      // Enhanced scope for comprehensive material capture
      "Enhanced scope: Capture ALL framing materials including:",
      "- Studs: size, spacing, corner/T-intersection counts, jack/king/cripple studs",
      "- Plates: bottom (PT requirements), top (double), splice laps, lengths",
      "- Headers: size, ply count, species, engineered lumber type, bearing length",
      "- Sheathing: thickness, grade, nailing patterns (edge/field spacing), opening subtracts",
      "- Blocking: firestopping, shear wall nailing, backing, fire/sound ratings",
      "- Connectors: hold-downs, straps, clips, hurricane ties, post anchors by mark",
      "- Fasteners: nail/screw types, sizes, spacing patterns, galvanization, quantities",
      "- Anchors: bolt sizes, spacing rules, corner/additional requirements",
      // NEW: Joist and roof framing analysis
      "- Floor Joists: size, spacing, length, species, grade, blocking, hangers, bridging",
      "- Ceiling Joists: size, spacing, length, species, grade, blocking, hangers",
      "- Roof Rafters: size, spacing, length, species, grade, pitch, overhang, ridge board",
      "- Floor/Deck Sheathing: thickness, grade, nailing patterns, tongue & groove",
      "- Roof Sheathing: thickness, grade, nailing patterns, moisture resistance",
      "Record every material specification found in drawings, schedules, and specifications.",
      "- Units & numbers: compute in imperial dimensions when drawings/specs are imperial; keep all numbers as pure JSON numbers (no units embedded). Track UOM separately per the schema.",
      "- Waste & optimization: apply the provided wasteRules exactly as given; do not assume additional waste unless a source explicitly requires it. If stock-length optimization is required by the schema, record assumptions used.",
      "- Missing info: when required inputs are unavailable/unclear, (1) apply intelligent reasoning based on available architectural information and building codes; (2) add a flag describing assumptions made; (3) propose candidates (options) only if you have partial evidence (e.g., spec allows \"SPF or DF-L No.2\"). When S-series plans are missing, infer structural requirements from opening sizes, architectural details, and code minimums.",
      "- Calibration: for each sheet used in measurements, confirm scale using the scale bar and at least one known dimension; record the chosen scale and a confidence. If no scale/known dimension is available, mark measurements as assumptions with reduced confidence and add a flag.",
      "",
      "Reading order (follow this sequence):",
      "1) Title blocks & drawing index → confirm completeness; record sheet IDs and revisions.",
      "2) General notes (A0.x/S0.x) → global constraints, plate heights if stated, seismic/wind category, nailing/anchor generalities.",
      "3) Specifications (Division 06 Rough Carpentry and related sections; relevant Div 05/09 if referenced) → species/grade, PT requirements, moisture content, fastener/connectors requirements, prohibited substitutions. Extract clause IDs verbatim.",
      "4) Wall type legend(s) → build a lookup: tag → stud size/spacing, sheathing type/thickness, gyp layers, fire/sound ratings. If multiple legends exist, use the latest/most-applicable per sheet references and record the governing legend sheet.",
      "5) Plans by level (A1xx) → trace wall runs and tags; classify interior/exterior; locate corners/T-intersections; find openings (symbols) and cross-reference door/window schedules for RO sizes.",
      "6) Schedules → Door/Window schedules (architectural) for RO; Header/Beam schedules (structural) for member sizes/plies/species; Shear wall schedules (structural) for IDs, sheathing thickness, nailing patterns, hold-down types/locations.",
      "7) Structural plans/details (S1xx/S3xx/S4xx) → headers, posts, chords/collectors, hold-downs/straps, anchor bolt spacing/edge distances; nailing schedules; detail callouts (\"SEE 3/S4.1\")—resolve and extract governing notes.",
      "8) Addenda/Bulletins/RFIs (if present) → apply revisions that supersede prior information; record references.",
      // Enhanced reading order for comprehensive material capture
      "9) Connector schedules → Extract all hold-downs, straps, clips, hurricane ties by mark and location.",
      "10) Fastener schedules → Record nailing patterns, spacing, fastener types, galvanization requirements.",
      "11) Material specifications → Extract species, grades, treatments, thicknesses from all sources.",
      "12) Code requirements → Note seismic, wind, fire, and sound rating requirements affecting materials.",
      // NEW: Joist and roof framing analysis
      "13) Floor framing plans → Extract joist sizes, spacing, lengths, species, grade, blocking requirements",
      "14) Roof framing plans → Extract rafter sizes, spacing, lengths, pitch, overhang, ridge board",
      "15) Sheathing schedules → Extract floor, roof, and wall sheathing specifications and nailing patterns",
      "16) Truss details → Extract truss types, spacing, connections, and any engineered specifications",
      "",
      "Extraction & reconciliation rules:",
      "- Wall runs: keep by level; store clear length, wall type tag, plate height, interior/exterior designation, and bounding boxes/coordinates on the sheet for evidence previews.",
      "- Openings: derive rough openings from schedules; propagate to jack/king/cripple counts and sheathing subtracts. If only nominal sizes are available, apply schedule-stated RO deltas; otherwise flag as assumption.",
      "- PT plates: mark PT bottom plates where required by specs, exterior at slab-on-grade, wet rooms per details/notes, or explicit PT callouts.",
      "- Shear walls: capture ID, sheathing material/thickness, nailing (edge/field spacing), boundary elements, hold-downs by mark and location.",
      "- Headers: map header IDs to sizes/plies/species from the schedule; where schedules are absent, use explicit detail callouts; when no structural plans exist, infer header sizes from opening widths using standard span tables (2x8 for openings ≤4', double 2x10 for 4'-6', etc.) and flag as assumption with reasoning.",
      "- Species/grade: extract allowed species/grades (e.g., SPF No.2, DF-L No.2) from specs/S0.x. If multiple allowed, set the default to the least-cost compliant option (without pricing) and list the alternates in candidates; note the governing clauses.",
      // Enhanced extraction rules for comprehensive material capture
      "- Connectors: extract hold-downs, straps, clips by mark from structural schedules; when schedules are missing, assume standard connectors based on member sizes (U-hangers for joists, post anchors for posts, hold-downs for shear walls) and flag as assumption.",
      "- Fasteners: convert nailing schedules to quantities; when schedules are missing, apply code-compliant nailing patterns (8d @ 6\" edges, 12\" field for sheathing; 16d for framing connections) and flag as code minimum assumption.",
      "- Sheathing: record thickness, grade, edge/field nailing spacing, and subtract openings above threshold; calculate sheet counts using actual dimensions.",
      "- Blocking: quantify per shear wall nailing schedules, firestopping requirements, and typical details; record purpose and fire/sound ratings.",
      "- Anchors: compute bolt counts from spacing rules, include corner/additional bolts per notes, cite governing specifications.",
      // NEW: Joist and roof framing extraction rules
      "- Floor Joists: extract size, spacing, length from floor plans; record species, grade, blocking spacing, hanger types, bridging requirements",
      "- Ceiling Joists: extract size, spacing, length from ceiling plans; record species, grade, blocking, hanger types",
      "- Roof Rafters: extract size, spacing, length, pitch from roof plans; record species, grade, overhang, ridge board, collar ties",
      "- Floor/Deck Sheathing: extract thickness, grade, size from schedules; record nailing patterns, tongue & groove, moisture resistance",
      "- Roof Sheathing: extract thickness, grade, size from schedules; record nailing patterns, moisture resistance, fire rating",
      "",
      "Quantification rules (record the rule used alongside each quantity):",
      "- Stud walls:",
      "  • Stud spacing → from wall legend; if not stated, default 16″ o.c. and add a flag.",
      "  • Stud count = ceil(clear_length / spacing) + end studs; add corner/T-intersection studs per typical details (default: 3-stud corner, 2-stud T) unless a typical detail overrides it.",
      "  • Jack/king/cripple studs → from openings and header requirements; compute per opening width and header schedule.",
      "  • Plates → 1 bottom (PT where required) + 2 top plates; LF equals wall run length (include splice laps if detailed).",
      "  • Blocking/backing → per shear nailing schedules, firestopping, and typical details; quantify in LF with source notes.",
      "- Sheathing:",
      "  • Wall sheathing SF = (wall length × plate height) − sum(openings area) with an opening-size threshold per the legend/spec (default subtract openings > 4 ft²; flag if assumed).",
      "  • Sheet count = ceil(SF / sheet_area) using the actual specified sheet size/thickness; store thickness/grade and nailing pattern.",
      "- Connectors & anchors:",
      "  • Hold-downs/straps/clips by explicit mark and location from structural schedules/details.",
      "  • Anchor bolts: compute counts from spacing rules (e.g., \"1/2″ @ 6′-0″ o.c., 12″ from corners/openings\") and wall lengths; include corner/additional bolts per notes; cite the note/schedule ID.",
      "  • Fasteners (nails/screws): convert nailing schedules (e.g., 8d @ 6″/12″) into quantities using perimeters, stud counts, and panel layouts; round to standard packaging only if required by the schema.",
      "- Waste: apply wasteRules.{studs_pct, plates_pct, sheathing_pct, …} exactly as provided; store waste separately from net quantities.",
      "- Stock lengths: if optimization is expected by the schema, prefer typical stock lengths (8/10/12/14/16/20 ft) and document the heuristic; otherwise leave optimization out and report raw counts.",
      // Enhanced quantification rules for comprehensive material capture
      "- Headers:",
      "  • Size calculation = rough opening + bearing length each side; record ply count and engineered lumber type.",
      "  • Species/grade from schedule; if multiple options, record all candidates with confidence scores.",
      "- Blocking:",
      "  • Firestopping: per fire rating requirements and typical details; record purpose and rating.",
      "  • Shear wall: per nailing schedule requirements; record nailing pattern and spacing.",
      "- Material specifications:",
      "  • Record all available details: thickness, width, height, length, ply count, grade, treatment.",
      "  • Nailing patterns: edge spacing, field spacing, fastener type, size, galvanization.",
      "  • Connector details: type, size, material, location, quantity requirements.",
      // NEW: Joist and roof framing quantification rules
      "- Floor Joists:",
      "  • Count = floor area / (joist spacing × joist length) + waste factor; record blocking per typical details",
      "  • Hangers: count per joist end; record type, size, material from schedules",
      "  • Bridging: count per joist spacing; record type, spacing, material from schedules",
      "- Ceiling Joists:",
      "  • Count = ceiling area / (joist spacing × joist length) + waste factor; record blocking per typical details",
      "  • Hangers: count per joist end; record type, size, material from schedules",
      "- Roof Rafters:",
      "  • Count = roof area / (rafter spacing × rafter length) + waste factor; record ridge board, collar ties",
      "  • Overhang: calculate overhang length and material; record fascia, soffit requirements",
      "- Floor/Deck Sheathing:",
      "  • Area = floor area + waste factor; sheet count = ceil(area / sheet area); record nailing patterns",
      "  • Tongue & groove: record if specified; note edge nailing requirements",
      "- Roof Sheathing:",
      "  • Area = roof area + waste factor; sheet count = ceil(area / sheet area); record nailing patterns",
      "  • Moisture resistance: record if specified; note underlayment requirements",
      "",
      "Evidence & auditability (for every derived item):",
      "- Store: sheet ID, view/callout/detail reference, schedule/legend/spec identifiers (e.g., \"A001 Wall Legend\", \"S4.1 Header Schedule H3\", \"06 10 00 §2.3.A\"), any extracted text used, and a bounding box on the page for previewing.",
      "- Confidence model: higher for direct table/schedule entries and explicit detail notes; lower for OCR from low-resolution crops; penalize when using assumed scales or default spacings.",
      "",
      "Flags & candidates:",
      "- Always add a flag when information is missing, contradictory, or derived from assumed defaults (e.g., missing header schedule on L2; ambiguous species/grade; scale not found). When applying structural reasoning due to missing S-series plans, use flag type 'ASSUMPTION' instead of 'MISSING_INFO' and include reasoning explanation.",
      "- Provide candidates (ordered, with reasons) when multiple compliant options exist (e.g., species alternatives from specs; two header sizes referenced on different sheets).",
      "- Keep messages concise, actionable, and cite sources.",
      "",
      "Never:",
      "- When structural plans (S-series) are available, never infer building code minimums or structural member sizes that are not explicitly required by the documents. When S-series plans are missing, apply intelligent reasoning using building code minimums and standard construction practices, but flag all assumptions clearly.",
      "- Never output narrative text outside the JSON object requested by the output policy.",
      "",
      "Output policy:",
      "- Return ONLY a single JSON object that matches the schema below.",
      "- Do NOT include any prose before or after the JSON.",
      "- Wrap the JSON in ```json fences only if necessary; otherwise plain JSON is fine.",
      "- All numbers must be valid JSON numbers (no units embedded).",
      "- confidence fields must be in [0,1].",
      "- If required info is missing, return empty arrays and add a flag explaining the gap.",
    ].join("\n");

    const standards = [
      `Default stud spacing: ${this.constructionStandards.studSpacingDefault} in o.c.`,
      `Corner studs: ${this.constructionStandards.cornerStudCount}`,
      `T-intersection studs: ${this.constructionStandards.tIntersectionStudCount}`,
      `Header bearing: ${this.constructionStandards.headerBearing} in each side`,
    ].join("\n");

    const waste = [
      `Studs: ${wasteRules.studsPct}%`,
      `Plates: ${wasteRules.platesPct}%`,
      `Sheathing: ${wasteRules.sheathingPct}%`,
      `Blocking: ${wasteRules.blockingPct}%`,
      `Fasteners: ${wasteRules.fastenersPct}%`,
      // Enhanced waste rules for new systems (using optional chaining for safety)
      `Joists: ${wasteRules.joistsPct ?? 5}%`,
      `Roof Framing: ${wasteRules.roofFramingPct ?? 5}%`,
      `Floor/Deck Sheathing: ${wasteRules.floorSheathingPct ?? wasteRules.sheathingPct}%`,
      `Roof Sheathing: ${wasteRules.roofSheathingPct ?? wasteRules.sheathingPct}%`,
    ].join("\n");

    const schema = `{
  "project": {
    "name": "",
    "address": "",
    "levels": [],
    "buildingCode": "",
    "seismicCategory": "",
    "windCategory": ""
  },
  "wallTypes": [
    {
      "id": "",
      "studSize": "",
      "studSpacing": 16,
      "plateCount": 3,
      "sheathing": "",
      "fireRating": "",
      "description": "",
      "sheathingThickness": 0,
      "sheathingGrade": "",
      "sheathingNailing": "",
      "gypLayers": 0,
      "soundRating": "",
      "typicalPlateHeight": 0,
      "cornerStudCount": 3,
      "tIntersectionStudCount": 2,
      "openingThreshold": 4
    }
  ],
  "joistSystems": [
    {
      "id": "",
      "type": "floor",
      "joistSize": "",
      "joistSpacing": 16,
      "joistLength": 0,
      "species": "",
      "grade": "",
      "treatment": "",
      "blockingSpacing": 0,
      "blockingSize": "",
      "fireRating": "",
      "soundRating": "",
      "description": "",
      "joistDepth": 0,
      "joistWidth": 0,
      "engineeredLumber": false,
      "engineeredType": "",
      "bearingLength": 0,
      "hangerType": "",
      "hangerSize": "",
      "bridgingType": "",
      "bridgingSpacing": 0
    }
  ],
  "roofFraming": [
    {
      "id": "",
      "rafterSize": "",
      "rafterSpacing": 16,
      "rafterLength": 0,
      "species": "",
      "grade": "",
      "treatment": "",
      "pitch": 0,
      "overhang": 0,
      "ridgeBoard": "",
      "collarTies": "",
      "rafterTies": "",
      "description": "",
      "rafterDepth": 0,
      "rafterWidth": 0,
      "engineeredLumber": false,
      "engineeredType": "",
      "bearingLength": 0,
      "hangerType": "",
      "hangerSize": "",
      "blockingSpacing": 0,
      "blockingSize": ""
    }
  ],
  "sheathingSystems": [
    {
      "id": "",
      "type": "floor",
      "material": "",
      "thickness": 0,
      "grade": "",
      "size": "",
      "nailingPattern": "",
      "edgeSpacing": "",
      "fieldSpacing": "",
      "fastenerType": "",
      "fastenerSize": "",
      "description": "",
      "width": 0,
      "length": 0,
      "plyCount": 0,
      "treatment": "",
      "fireRating": "",
      "moistureResistant": false,
      "tongueAndGroove": false
    }
  ],
  "takeoff": [
    {
      "itemId": "",
      "uom": "EA",
      "qty": 0,
      "material": {
        "spec": "",
        "grade": "",
        "size": "",
        "species": "",
        "treatment": "",
        "thickness": 0,
        "width": 0,
        "height": 0,
        "length": 0,
        "plyCount": 0,
        "nailingPattern": "",
        "fastenerType": "",
        "fastenerSize": "",
        "connectorType": "",
        "anchorSpec": "",
        "sheathingGrade": "",
        "edgeSpacing": "",
        "fieldSpacing": "",
        "headerType": "",
        "bearingLength": 0,
        "blockingPurpose": "",
        "fireRating": "",
        "soundRating": ""
      },
      "context": {
        "scope": "",
        "wallType": "",
        "level": "",
        "sheetRef": "",
        "viewRef": "",
        "bbox": [0, 0, 0, 0],
        "sourceNotes": []
      },
      "assumptions": [],
      "confidence": 0.8,
      "evidenceRefs": [
        {
          "documentId": "",
          "pageNumber": 0,
          "coordinates": [0, 0, 0, 0],
          "description": ""
        }
      ],
      "quantificationRule": {
        "ruleType": "",
        "description": "",
        "formula": "",
        "assumptions": [],
        "source": ""
      },
      "waste": {
        "materialType": "",
        "wastePercentage": 0,
        "appliedQuantity": 0,
        "wasteQuantity": 0,
        "source": ""
      },
      "stockLength": 0,
      "stockLengthAssumption": "",
      "cornerStuds": 0,
      "tIntersectionStuds": 0,
      "openingSubtractions": 0,
      "nailingSchedule": {
        "type": "",
        "size": "",
        "spacing": "",
        "pattern": "",
        "quantity": 0,
        "galvanized": false,
        "sheetRef": ""
      }
    }
  ],
  "connectorSchedules": [
    {
      "mark": "",
      "type": "",
      "description": "",
      "size": "",
      "material": "",
      "quantity": 0,
      "location": "",
      "sheetRef": ""
    }
  ],
  "fastenerSchedules": [
    {
      "type": "",
      "size": "",
      "spacing": "",
      "pattern": "",
      "quantity": 0,
      "galvanized": false,
      "sheetRef": ""
    }
  ],
  "flags": [
    {
      "type": "MISSING_INFO",
      "message": "",
      "severity": "low",
      "sheets": [],
      "resolved": false
    }
  ],
  "confidence": 0.8
}`;

    const quantRules = [
      "Stud spacing: from legend; default 16 in o.c. if absent (flag).",
      "Stud count = ceil(clear_length/spacing) + end studs + corners/Ts per typicals.",
      "Plates: 1 bottom (PT where required), 2 top (double).",
      "Headers: RO + bearing each side; species/size/ply per schedule.",
      "Sheathing SF = wall length * plate height − openings > 4 sf; sheet count = ceil(SF/sheet_area).",
      "Connectors/fasteners from S-notes and nailing schedules; round up by boxes/kegs.",
      // Enhanced quantification rules for comprehensive material capture
      "Connectors: Extract hold-downs, straps, clips by mark from structural schedules/details.",
      "Fasteners: Convert nailing schedules (e.g., 8d @ 6\"/12\") to quantities using perimeters and stud counts.",
      "Sheathing: Record thickness, grade, edge/field nailing spacing, and subtract openings > threshold.",
      "Headers: Map to schedule for size/plies/species; record bearing length and engineered lumber type.",
      "Blocking: Quantify per shear nailing schedules, firestopping, and typical details.",
      "Waste: Apply wasteRules exactly as provided; store waste separately from net quantities.",
      "Stock lengths: Prefer typical lengths (8/10/12/14/16/20 ft) and document assumptions.",
    ].join("\n");

    return [
      policy,
      "",
      `Document type: ${documentType}`,
      "Construction standards:",
      standards,
      "",
      "Waste factors:",
      waste,
      "",
      "Quantification rules:",
      quantRules,
      "",
      "Return strictly this JSON schema (no extra keys):",
      schema,
    ].join("\n");
  }

  // Normalize common alias keys from models to our expected schema
  private normalizeParsedJSON(data: any): any {
    try {
      const obj = data && typeof data === "object" ? { ...data } : {};

      const takeoff = Array.isArray(obj.takeoff)
        ? obj.takeoff
        : Array.isArray((obj as any).lineItems)
          ? (obj as any).lineItems
          : Array.isArray((obj as any).items)
            ? (obj as any).items
            : [];

      const flags = Array.isArray(obj.flags)
        ? obj.flags
        : Array.isArray((obj as any).issues)
          ? (obj as any).issues
          : [];

      const rawConfidence = (obj as any).confidence ?? (obj as any).score ?? (obj as any).confidenceScore;
      const confidenceNum = typeof rawConfidence === "number" ? rawConfidence : Number(rawConfidence);
      const confidence = Number.isFinite(confidenceNum)
        ? Math.max(0, Math.min(1, confidenceNum))
        : 0.5;

      return {
        ...obj,
        takeoff,
        flags,
        confidence,
      };
    } catch (e) {
      return {
        takeoff: [],
        flags: [],
        confidence: 0.5,
      };
    }
  }

  private parseAnalysisResponse(response: string): PDFAnalysisResult {
    // Use robust JSON parser with repair capabilities
    const extractionResult = RobustJSONParser.extractJSON(response, {
      attemptRepair: true,
      maxRepairAttempts: 3,
      logErrors: true,
      fallbackToPartial: true,
    });

    if (!extractionResult.success) {
      console.warn('[PDFAnalysisService] JSON extraction failed:', extractionResult.error);
      console.warn('[PDFAnalysisService] Response preview:', response.substring(0, 1000));
      
      return this.safeResultWithFlags(
        `Failed to extract JSON from AI response: ${extractionResult.error}`,
        ["All"]
      );
    }

    const parsedRaw = extractionResult.data;
    const parsed = this.normalizeParsedJSON(parsedRaw);
    
    // Validate the extracted JSON structure
    const validation = RobustJSONParser.validateJSONStructure(parsed);
    if (!validation.valid) {
      console.warn('[PDFAnalysisService] JSON validation failed:', validation.errors);
      
      // If we have partial data, try to use it
      if (extractionResult.partialData) {
        console.log('[PDFAnalysisService] Using partial data due to validation errors');
        return this.buildResultFromPartialData(extractionResult.partialData, validation.errors);
      }
      
      return this.safeResultWithFlags(
        `Invalid JSON structure: ${validation.errors.join(', ')}`,
        ["All"]
      );
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.warn('[PDFAnalysisService] JSON validation warnings:', validation.warnings);
    }

    // Log repair information if applicable
    if (extractionResult.repairAttempted) {
      console.log('[PDFAnalysisService] JSON was successfully repaired');
    }

    try {

      const lineItems: TakeoffLineItem[] = Array.isArray(parsed.takeoff)
        ? parsed.takeoff.map((item: any) => {
            try {
              return {
                itemId: item.itemId || `ITEM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                uom: item.uom || "EA",
                qty: Number(item.qty) || 0,
                material: {
                  spec: item.material?.spec || "Unknown",
                  grade: item.material?.grade || "Standard",
                  size: item.material?.size,
                  species: item.material?.species,
                  treatment: item.material?.treatment,
                  // Enhanced material fields
                  thickness: item.material?.thickness ? Number(item.material.thickness) : undefined,
                  width: item.material?.width ? Number(item.material.width) : undefined,
                  height: item.material?.height ? Number(item.material.height) : undefined,
                  length: item.material?.length ? Number(item.material.length) : undefined,
                  plyCount: item.material?.plyCount ? Number(item.material.plyCount) : undefined,
                  nailingPattern: item.material?.nailingPattern,
                  fastenerType: item.material?.fastenerType,
                  fastenerSize: item.material?.fastenerSize,
                  connectorType: item.material?.connectorType,
                  anchorSpec: item.material?.anchorSpec,
                  sheathingGrade: item.material?.sheathingGrade,
                  edgeSpacing: item.material?.edgeSpacing,
                  fieldSpacing: item.material?.fieldSpacing,
                  headerType: item.material?.headerType,
                  bearingLength: item.material?.bearingLength ? Number(item.material.bearingLength) : undefined,
                  blockingPurpose: item.material?.blockingPurpose,
                  fireRating: item.material?.fireRating,
                  soundRating: item.material?.soundRating,
                },
                 context: {
                   scope: item.context?.scope || "Unknown",
                   wallType: item.context?.wallType,
                   level: normalizeLevel(item.context?.level || "L1"),
                   sheetRef: item.context?.sheetRef || "Unknown",
                   viewRef: item.context?.viewRef || "Plan",
                   bbox: item.context?.bbox,
                   sourceNotes: item.context?.sourceNotes || [],
                 },

                assumptions: item.assumptions || [],
                confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.5)),
                evidenceRefs: Array.isArray(item.evidenceRefs)
                  ? item.evidenceRefs.map((ref: any) => ({
                      documentId: ref.documentId || "unknown",
                      pageNumber: Number(ref.pageNumber) || 1,
                      coordinates: ref.coordinates,
                      description: ref.description || "No description",
                    }))
                  : [],
                // Enhanced fields
                quantificationRule: item.quantificationRule ? {
                  ruleType: item.quantificationRule.ruleType || "",
                  description: item.quantificationRule.description || "",
                  formula: item.quantificationRule.formula,
                  assumptions: item.quantificationRule.assumptions || [],
                  source: item.quantificationRule.source || "",
                } : undefined,
                waste: item.waste ? {
                  materialType: item.waste.materialType || "",
                  wastePercentage: Number(item.waste.wastePercentage) || 0,
                  appliedQuantity: Number(item.waste.appliedQuantity) || 0,
                  wasteQuantity: Number(item.waste.wasteQuantity) || 0,
                  source: item.waste.source || "",
                } : undefined,
                stockLength: item.stockLength ? Number(item.stockLength) : undefined,
                stockLengthAssumption: item.stockLengthAssumption,
                cornerStuds: item.cornerStuds ? Number(item.cornerStuds) : undefined,
                tIntersectionStuds: item.tIntersectionStuds ? Number(item.tIntersectionStuds) : undefined,
                openingSubtractions: item.openingSubtractions ? Number(item.openingSubtractions) : undefined,
                nailingSchedule: item.nailingSchedule ? {
                  type: item.nailingSchedule.type || "",
                  size: item.nailingSchedule.size || "",
                  spacing: item.nailingSchedule.spacing || "",
                  pattern: item.nailingSchedule.pattern || "",
                  quantity: item.nailingSchedule.quantity ? Number(item.nailingSchedule.quantity) : undefined,
                  galvanized: Boolean(item.nailingSchedule.galvanized),
                  sheetRef: item.nailingSchedule.sheetRef,
                } : undefined,
              };
            } catch (error) {
              console.warn('Error parsing line item:', error, item);
              return null;
            }
          }).filter(Boolean) as TakeoffLineItem[]
        : [];

      const flags: TakeoffFlag[] = Array.isArray(parsed.flags)
        ? parsed.flags.map((flag: any) => {
            try {
              return {
                type: (flag.type as FlagType) || "MISSING_INFO",
                message: flag.message || "No message",
                severity: (flag.severity as FlagSeverity) || "low",
                sheets: Array.isArray(flag.sheets) ? flag.sheets : [],
                resolved: Boolean(flag.resolved),
              };
            } catch (error) {
              console.warn('Error parsing flag:', error, flag);
              return null;
            }
          }).filter(Boolean) as TakeoffFlag[]
        : [];

      // Parse enhanced schedules and systems
      const connectorSchedules: ConnectorSchedule[] = Array.isArray(parsed.connectorSchedules)
        ? parsed.connectorSchedules.map((schedule: any) => {
            try {
              return {
                mark: schedule.mark || `CONN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: schedule.type || "",
                description: schedule.description || "",
                size: schedule.size,
                material: schedule.material,
                quantity: schedule.quantity ? Number(schedule.quantity) : undefined,
                location: schedule.location,
                sheetRef: schedule.sheetRef,
              };
            } catch (error) {
              console.warn('Error parsing connector schedule:', error, schedule);
              return null;
            }
          }).filter(Boolean) as ConnectorSchedule[]
        : [];

      const fastenerSchedules: FastenerSchedule[] = Array.isArray(parsed.fastenerSchedules)
        ? parsed.fastenerSchedules.map((schedule: any) => {
            try {
              return {
                type: schedule.type || "",
                size: schedule.size || "",
                spacing: schedule.spacing || "",
                pattern: schedule.pattern || "",
                quantity: schedule.quantity ? Number(schedule.quantity) : undefined,
                galvanized: Boolean(schedule.galvanized),
                sheetRef: schedule.sheetRef,
              };
            } catch (error) {
              console.warn('Error parsing fastener schedule:', error, schedule);
              return null;
            }
          }).filter(Boolean) as FastenerSchedule[]
        : [];

      // NEW: Parse joist systems, roof framing, and sheathing systems
      const joistSystems: JoistSystem[] = Array.isArray(parsed.joistSystems)
        ? parsed.joistSystems.map((system: any) => {
            try {
              return {
                id: system.id || `JOIST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: system.type && ['floor', 'ceiling', 'roof'].includes(system.type) ? system.type : "floor",
                joistSize: system.joistSize || "",
                joistSpacing: Number(system.joistSpacing) || 16,
                joistLength: Number(system.joistLength) || 0,
                species: system.species || "",
                grade: system.grade || "",
                treatment: system.treatment,
                blockingSpacing: system.blockingSpacing ? Number(system.blockingSpacing) : undefined,
                blockingSize: system.blockingSize,
                fireRating: system.fireRating,
                soundRating: system.soundRating,
                description: system.description || "",
                joistDepth: Number(system.joistDepth) || 0,
                joistWidth: Number(system.joistWidth) || 0,
                engineeredLumber: Boolean(system.engineeredLumber),
                engineeredType: system.engineeredType,
                bearingLength: Number(system.bearingLength) || 0,
                hangerType: system.hangerType,
                hangerSize: system.hangerSize,
                bridgingType: system.bridgingType,
                bridgingSpacing: system.bridgingSpacing ? Number(system.bridgingSpacing) : undefined,
              };
            } catch (error) {
              console.warn('Error parsing joist system:', error, system);
              return null;
            }
          }).filter(Boolean) as JoistSystem[]
        : [];

      const roofFraming: RoofFraming[] = Array.isArray(parsed.roofFraming)
        ? parsed.roofFraming.map((roof: any) => {
            try {
              return {
                id: roof.id || `ROOF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                rafterSize: roof.rafterSize || "",
                rafterSpacing: Number(roof.rafterSpacing) || 16,
                rafterLength: Number(roof.rafterLength) || 0,
                species: roof.species || "",
                grade: roof.grade || "",
                treatment: roof.treatment,
                pitch: Number(roof.pitch) || 0,
                overhang: Number(roof.overhang) || 0,
                ridgeBoard: roof.ridgeBoard || "",
                collarTies: roof.collarTies,
                rafterTies: roof.rafterTies,
                description: roof.description || "",
                rafterDepth: Number(roof.rafterDepth) || 0,
                rafterWidth: Number(roof.rafterWidth) || 0,
                engineeredLumber: Boolean(roof.engineeredLumber),
                engineeredType: roof.engineeredType,
                bearingLength: Number(roof.bearingLength) || 0,
                hangerType: roof.hangerType,
                hangerSize: roof.hangerSize,
                blockingSpacing: roof.blockingSpacing ? Number(roof.blockingSpacing) : undefined,
                blockingSize: roof.blockingSize,
              };
            } catch (error) {
              console.warn('Error parsing roof framing:', error, roof);
              return null;
            }
          }).filter(Boolean) as RoofFraming[]
        : [];

      const sheathingSystems: SheathingSystem[] = Array.isArray(parsed.sheathingSystems)
        ? parsed.sheathingSystems.map((sheathing: any) => {
            try {
              return {
                id: sheathing.id || `SHEATHING_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: sheathing.type && ['floor', 'roof', 'wall'].includes(sheathing.type) ? sheathing.type : "floor",
                material: sheathing.material || "",
                thickness: Number(sheathing.thickness) || 0,
                grade: sheathing.grade || "",
                size: sheathing.size || "",
                nailingPattern: sheathing.nailingPattern || "",
                edgeSpacing: sheathing.edgeSpacing || "",
                fieldSpacing: sheathing.fieldSpacing || "",
                fastenerType: sheathing.fastenerType || "",
                fastenerSize: sheathing.fastenerSize || "",
                description: sheathing.description || "",
                width: Number(sheathing.width) || 0,
                length: Number(sheathing.length) || 0,
                plyCount: sheathing.plyCount ? Number(sheathing.plyCount) : undefined,
                treatment: sheathing.treatment,
                fireRating: sheathing.fireRating,
                moistureResistant: Boolean(sheathing.moistureResistant),
                tongueAndGroove: Boolean(sheathing.tongueAndGroove),
              };
            } catch (error) {
              console.warn('Error parsing sheathing system:', error, sheathing);
              return null;
            }
          }).filter(Boolean) as SheathingSystem[]
        : [];

      const wallTypes: WallType[] = Array.isArray(parsed.wallTypes)
        ? parsed.wallTypes.map((wallType: any) => {
            try {
              return {
                id: wallType.id || `WALL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                studSize: wallType.studSize || "",
                studSpacing: Number(wallType.studSpacing) || 16,
                plateCount: Number(wallType.plateCount) || 3,
                sheathing: wallType.sheathing || "",
                fireRating: wallType.fireRating,
                description: wallType.description || "",
                // Enhanced wall type fields
                sheathingThickness: wallType.sheathingThickness ? Number(wallType.sheathingThickness) : undefined,
                sheathingGrade: wallType.sheathingGrade,
                sheathingNailing: wallType.sheathingNailing,
                gypLayers: wallType.gypLayers ? Number(wallType.gypLayers) : undefined,
                soundRating: wallType.soundRating,
                typicalPlateHeight: wallType.typicalPlateHeight ? Number(wallType.typicalPlateHeight) : undefined,
                cornerStudCount: wallType.cornerStudCount ? Number(wallType.cornerStudCount) : 3,
                tIntersectionStudCount: wallType.tIntersectionStudCount ? Number(wallType.tIntersectionStudCount) : 2,
                openingThreshold: wallType.openingThreshold ? Number(wallType.openingThreshold) : 4,
              };
            } catch (error) {
              console.warn('Error parsing wall type:', error, wallType);
              return null;
            }
          }).filter(Boolean) as WallType[]
        : [];

       const projectInfo: ProjectInfo = parsed.project ? (() => {
         try {
           const rawLevels = Array.isArray(parsed.project.levels) ? parsed.project.levels : ["L1"];
           const levels = Array.from(new Set(rawLevels.map((l: string) => normalizeLevel(l))));
           return {
             name: parsed.project.name || "Unknown Project",
             address: parsed.project.address || "",
             levels,
             buildingCode: parsed.project.buildingCode,
             seismicCategory: parsed.project.seismicCategory,
             windCategory: parsed.project.windCategory,
           };
         } catch (error) {
           console.warn('Error parsing project info:', error, parsed.project);
           return {
             name: "Unknown Project",
             address: "",
             levels: ["GROUND FLOOR"],
           } as any;
         }
       })() : {
         name: "Unknown Project",
         address: "",
         levels: ["GROUND FLOOR"],
       } as any;


      return {
        lineItems,
        flags,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        projectInfo,
        wallTypes,
        // Enhanced schedules and systems for comprehensive material tracking
        connectorSchedules,
        fastenerSchedules,
        joistSystems,
        roofFraming,
        sheathingSystems,
      };
    } catch (e) {
      console.error('[PDFAnalysisService] Error processing parsed JSON:', e);
      return this.safeResultWithFlags(
        `Failed to process parsed JSON: ${e instanceof Error ? e.message : "Unknown error"}`,
        ["All"],
      );
    }
  }

  /**
   * Build result from partial data when full parsing fails
   */
  private buildResultFromPartialData(partialData: any, errors: string[]): PDFAnalysisResult {
    console.log('[PDFAnalysisService] Building result from partial data');

    // Accept common aliases and apply sensible defaults
    const takeoff = Array.isArray(partialData?.takeoff)
      ? partialData.takeoff
      : Array.isArray(partialData?.lineItems)
        ? partialData.lineItems
        : Array.isArray(partialData?.items)
          ? partialData.items
          : [];

    const flags = Array.isArray(partialData?.flags)
      ? partialData.flags
      : Array.isArray(partialData?.issues)
        ? partialData.issues
        : [];

    const rawConfidence = partialData?.confidence ?? partialData?.score ?? partialData?.confidenceScore;
    const confNum = typeof rawConfidence === "number" ? rawConfidence : Number(rawConfidence);
    const confidence = Number.isFinite(confNum) ? Math.max(0.1, Math.min(0.5, confNum)) : 0.3; // cap in partial mode
    
    const result: PDFAnalysisResult = {
      lineItems: [],
      flags: [],
      confidence,
      projectInfo: {
        name: "Unknown Project",
        address: "",
        levels: ["L1"],
      },
      wallTypes: [],
      connectorSchedules: [],
      fastenerSchedules: [],
      joistSystems: [],
      roofFraming: [],
      sheathingSystems: [],
    };

    // Extract what we can from partial data
    if (Array.isArray(takeoff)) {
      result.lineItems = takeoff.slice(0, 10);
      console.log(`[PDFAnalysisService] Extracted ${result.lineItems.length} line items from partial data`);
    }

    if (partialData?.project) {
      result.projectInfo = {
        name: partialData.project.name || "Unknown Project",
        address: partialData.project.address || "",
        levels: Array.isArray(partialData.project.levels) ? partialData.project.levels : ["L1"],
        buildingCode: partialData.project.buildingCode,
        seismicCategory: partialData.project.seismicCategory,
        windCategory: partialData.project.windCategory,
      };
    }

    if (Array.isArray(flags)) {
      result.flags = flags.slice(0, 5);
    }

    // Add flag about partial extraction
    result.flags.push({
      type: "MISSING_INFO",
      message: `Partial data extraction due to JSON parsing issues: ${errors.join(', ')}`,
      severity: "high",
      sheets: ["All"],
      resolved: false,
    });

    return result;
  }

  private safeResultWithFlags(message: string, sheets: string[]): PDFAnalysisResult {
    return {
      lineItems: [],
      flags: [
        {
          type: "MISSING_INFO",
          message,
          severity: "critical",
          sheets,
          resolved: false,
        },
      ],
      confidence: 0.1,
      projectInfo: {
        name: "Unknown Project",
        address: "",
        levels: ["L1"],
      },
      wallTypes: [],
      connectorSchedules: [],
      fastenerSchedules: [],
      joistSystems: [],
      roofFraming: [],
      sheathingSystems: [],
    };
  }

  async batchAnalyzeDocuments(
    documents: ProjectDocument[],
    wasteRules: WasteRules,
    onProgress?: (documentIndex: number, progress: number) => void,
  ): Promise<PDFAnalysisResult[]> {
    if (!Array.isArray(documents) || documents.length === 0) {
      console.warn('batchAnalyzeDocuments: No documents provided');
      return [];
    }

    const results: PDFAnalysisResult[] = [];

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      
      if (!document || !document.uri) {
        console.warn(`batchAnalyzeDocuments: Invalid document at index ${i}`);
        results.push(
          this.safeResultWithFlags(
            `Invalid document at index ${i}`,
            [`Document_${i}`],
          ),
        );
        continue;
      }

      try {
        onProgress?.(i, 0);
        const result = await this.analyzePDF(
          document,
          wasteRules,
          (progress) => onProgress?.(i, progress),
        );
        results.push(result);
        onProgress?.(i, 100);
      } catch (error) {
        console.error(`Error analyzing document ${document.name}:`, error);
        results.push(
          this.safeResultWithFlags(
            `Failed to analyze document: ${error instanceof Error ? error.message : "Unknown error"}`,
            [document.name],
          ),
        );
        onProgress?.(i, 100);
      }
    }

    return results;
  }

  combineAnalysisResults(results: PDFAnalysisResult[]): PDFAnalysisResult {
    if (results.length === 0) {
      return {
        lineItems: [],
        flags: [],
        confidence: 0,
        projectInfo: {
          name: "Unknown Project",
          address: "",
          levels: ["L1"],
        },
        wallTypes: [],
        connectorSchedules: [],
        fastenerSchedules: [],
        joistSystems: [],
        roofFraming: [],
        sheathingSystems: [],
      };
    }

    try {
      const allLineItems = results.flatMap((r) => r.lineItems || []);
      const allFlags = results.flatMap((r) => r.flags || []);
      const projectInfo = results.find((r) => r.projectInfo?.name !== "Unknown Project")?.projectInfo || results[0]?.projectInfo || {
        name: "Unknown Project",
        address: "",
        levels: ["L1"],
      };

      // Safely merge wall types with error handling
      const wallTypesMap = new Map<string, any>();
      results.forEach((r) => {
        try {
          if (Array.isArray(r.wallTypes)) {
            r.wallTypes.forEach((wt) => {
              if (wt && wt.id) {
                wallTypesMap.set(wt.id, wt);
              }
            });
          }
        } catch (error) {
          console.warn('Error processing wall types from result:', error);
        }
      });
      const wallTypes = Array.from(wallTypesMap.values());

      // Safely merge connector schedules with error handling
      const connectorSchedulesMap = new Map<string, any>();
      results.forEach((r) => {
        try {
          if (Array.isArray(r.connectorSchedules)) {
            r.connectorSchedules.forEach((cs) => {
              if (cs && cs.mark) {
                connectorSchedulesMap.set(cs.mark, cs);
              }
            });
          }
        } catch (error) {
          console.warn('Error processing connector schedules from result:', error);
        }
      });
      const connectorSchedules = Array.from(connectorSchedulesMap.values());

      // Safely merge fastener schedules with error handling
      const fastenerSchedulesMap = new Map<string, any>();
      results.forEach((r) => {
        try {
          if (Array.isArray(r.fastenerSchedules)) {
            r.fastenerSchedules.forEach((fs) => {
              if (fs && fs.type) {
                fastenerSchedulesMap.set(fs.type, fs);
              }
            });
          }
        } catch (error) {
          console.warn('Error processing fastener schedules from result:', error);
        }
      });
      const fastenerSchedules = Array.from(fastenerSchedulesMap.values());

      // Safely merge joist systems with error handling
      const joistSystemsMap = new Map<string, any>();
      results.forEach((r) => {
        try {
          if (Array.isArray(r.joistSystems)) {
            r.joistSystems.forEach((js) => {
              if (js && js.id) {
                joistSystemsMap.set(js.id, js);
              }
            });
          }
        } catch (error) {
          console.warn('Error processing joist systems from result:', error);
        }
      });
      const joistSystems = Array.from(joistSystemsMap.values());

      // Safely merge roof framing with error handling
      const roofFramingMap = new Map<string, any>();
      results.forEach((r) => {
        try {
          if (Array.isArray(r.roofFraming)) {
            r.roofFraming.forEach((rf) => {
              if (rf && rf.id) {
                roofFramingMap.set(rf.id, rf);
              }
            });
          }
        } catch (error) {
          console.warn('Error processing roof framing from result:', error);
        }
      });
      const roofFraming = Array.from(roofFramingMap.values());

      // Safely merge sheathing systems with error handling
      const sheathingSystemsMap = new Map<string, any>();
      results.forEach((r) => {
        try {
          if (Array.isArray(r.sheathingSystems)) {
            r.sheathingSystems.forEach((ss) => {
              if (ss && ss.id) {
                sheathingSystemsMap.set(ss.id, ss);
              }
            });
          }
        } catch (error) {
          console.warn('Error processing sheathing systems from result:', error);
        }
      });
      const sheathingSystems = Array.from(sheathingSystemsMap.values());

      const totalItems = allLineItems.length;
      const overallConfidence = totalItems > 0 ? allLineItems.reduce((sum, item) => sum + (item.confidence || 0), 0) / totalItems : 0;

      return {
        lineItems: allLineItems,
        flags: allFlags,
        confidence: overallConfidence,
        projectInfo,
        wallTypes,
        connectorSchedules,
        fastenerSchedules,
        joistSystems,
        roofFraming,
        sheathingSystems,
      };
    } catch (error) {
      console.error('Error combining analysis results:', error);
      return this.safeResultWithFlags(
        `Failed to combine analysis results: ${error instanceof Error ? error.message : "Unknown error"}`,
        ["All"],
      );
    }
  }
}
