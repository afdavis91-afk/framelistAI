import {
  TakeoffLineItem,
  ProjectDocument,
  EnrichmentContext,
  SpecCandidate,
  ScheduleCandidate,
  CalloutResolution,
  TakeoffFlag,
  DrawingAnalysis,
  GeoEntity,
  WallPolyline,
  Opening,
  FramingMember,
  EvidenceReference,
} from "../types/construction";
import { drawingUnderstandingService } from "./drawingUnderstandingService";
import { VisionEnrichmentModule } from "./enrichmentService/vision";
import { StructuralReasoningModule } from "./enrichmentService/structural/StructuralReasoningModule";

// Pipeline integration imports
import { appendEvidence, appendInference, appendFlag, type MaybeCtx } from "../pipeline";

export interface EnrichmentModule {
  name: string;
  process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void,
    pipelineContext?: any // Optional pipeline context for ledger integration
  ): Promise<EnrichmentResult>;
}

export interface EnrichmentResult {
  enrichedLineItems: TakeoffLineItem[];
  flags: TakeoffFlag[];
  confidence: number;
}

export class EnrichmentService {
  private modules: EnrichmentModule[] = [];
  private evidenceStore: Map<string, any> = new Map();

  constructor() {
    this.modules = [
      // Phase 1: Baseline text analysis
      new SpecHarvesterModule(),
      new ScheduleExtractorModule(),
      new CalloutResolverModule(),
      new SystemsLinkerModule(),
      
      // Phase 2: Baseline reconciliation
      new BaselineReconciliationModule(),
      
      // Phase 3: Expert gap analysis
      new ExpertGapAnalysisModule(),
      
      // Phase 4: Drawing analysis with context
      new DrawingPageClassifierModule(),
      new GeometryExtractionModule(),
      new VisionEnrichmentModule(),
      
      // Phase 5: Advanced reasoning with drawing data
      new AdvancedReasoningModule(),
      new HangerAndBlockingEnricherModule(),
      new SheathingFastenerEnricherModule(),
      new ConnectorScheduleMergerModule(),
    ];
  }

  async enrichAnalysis(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void,
    pipelineContext?: any // Optional pipeline context for ledger integration
  ): Promise<EnrichmentResult> {
    let enrichedItems = [...lineItems];
    const allFlags: TakeoffFlag[] = [];
    let totalConfidenceBoost = 0;

    onProgress?.(5);

    // Respect settings toggle for drawing analysis modules
    let effectiveModules = this.modules;
    try {
      const { useSettingsStore } = await import("../state/settingsStore");
      const enableDrawing = useSettingsStore.getState().enableDrawingAnalysis;
      if (!enableDrawing) {
        effectiveModules = this.modules.filter(
          (m) => !["DrawingPageClassifier", "GeometryExtraction", "BaselineReconciliation"].includes(m.name)
        );
      }
    } catch (e) {
      // If settings store fails to load, run all modules as a safe default
      effectiveModules = this.modules;
    }

    const totalModules = Math.max(1, effectiveModules.length);

    for (let i = 0; i < effectiveModules.length; i++) {
      const module = effectiveModules[i];
      const moduleProgress = (i / totalModules) * 80 + 10;
      
      try {
        const result = await module.process(
          enrichedItems,
          context,
          (progress) => onProgress?.(moduleProgress + (progress * 0.8) / totalModules)
        );
        
        enrichedItems = result.enrichedLineItems;
        allFlags.push(...result.flags);
        totalConfidenceBoost += result.confidence;

        // Append enrichment evidence to ledger if available
        if (pipelineContext?.ledger) {
          appendEvidence(pipelineContext, {
            type: "text",
            source: {
              documentId: context.projectDocuments?.[0]?.id || "unknown",
              pageNumber: 1,
              extractor: `enrichment_${module.name}`,
              confidence: 0.8,
            },
            content: {
              moduleName: module.name,
              enrichedItemsCount: result.enrichedLineItems.length,
              flagsGenerated: result.flags.length,
              confidenceBoost: result.confidence,
            },
            metadata: {
              contentType: "enrichment_result",
              moduleType: "enrichment",
            },
            timestamp: new Date().toISOString(),
            version: "1.0",
          });
        }
      } catch (error) {
        allFlags.push({
          type: "ASSUMPTION",
          message: `Module ${module.name} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          severity: "medium",
          sheets: [],
          resolved: false,
        });
      }
    }

    onProgress?.(95);

    // Apply confidence boost to items that were enriched
    const finalItems = enrichedItems.map(item => {
      if (item.enrichmentData && item.enrichmentData.confidenceBoost > 0) {
        return {
          ...item,
          confidence: Math.min(1.0, item.confidence + item.enrichmentData.confidenceBoost),
        };
      }
      return item;
    });

    onProgress?.(100);

    // Append final enrichment result to ledger if available
    if (pipelineContext?.ledger) {
      appendInference(pipelineContext, {
        topic: "enrichment_complete",
        value: {
          totalItems: finalItems.length,
          totalFlags: allFlags.length,
          confidenceBoost: totalConfidenceBoost / totalModules,
        },
        confidence: 0.9,
        method: "enrichment_pipeline",
        usedEvidence: [],
        usedAssumptions: [],
        explanation: `Enrichment completed with ${finalItems.length} items and ${allFlags.length} flags`,
        alternatives: [],
        timestamp: new Date().toISOString(),
        stage: "enrichment",
      });
    }

    return {
      enrichedLineItems: finalItems,
      flags: allFlags,
      confidence: totalConfidenceBoost / totalModules,
    };
  }

  // Cache management for deterministic results
  getCacheKey(projectId: string, documentHashes: string[]): string {
    return `enrichment_${projectId}_${documentHashes.sort().join("_")}`;
  }

  async getCachedResult(cacheKey: string): Promise<EnrichmentResult | null> {
    return this.evidenceStore.get(cacheKey) || null;
  }

  setCachedResult(cacheKey: string, result: EnrichmentResult): void {
    this.evidenceStore.set(cacheKey, result);
  }
}

// SpecHarvester Module - Extracts missing specifications from documents
class SpecHarvesterModule implements EnrichmentModule {
  name = "SpecHarvester";

  async process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<EnrichmentResult> {
    onProgress?.(10);

    const itemsNeedingSpecs = lineItems.filter(
      item => !item.material.spec || item.material.spec === "Unknown" || item.confidence < 0.7
    );

    if (itemsNeedingSpecs.length === 0) {
      return { enrichedLineItems: lineItems, flags: [], confidence: 0 };
    }

    onProgress?.(30);

    // Find specification documents
    const specDocs = context.projectDocuments.filter(
      doc => doc.type === "specifications" || doc.name.toLowerCase().includes("spec")
    );

    if (specDocs.length === 0) {
    return {
      enrichedLineItems: lineItems,
      flags: [{
        type: "MISSING_INFO",
        message: "No specification documents found for spec harvesting",
        severity: "medium",
        sheets: [],
        resolved: false,
      }],
      confidence: 0,
    };
    }

    onProgress?.(50);

    const enrichedItems = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let specCandidatesFound = 0;

    // Process each item needing specs
    for (let i = 0; i < itemsNeedingSpecs.length; i++) {
      const item = itemsNeedingSpecs[i];
      const candidates = await this.findSpecCandidates(item, specDocs);
      
      if (candidates.length > 0) {
        const bestCandidate = candidates[0]; // Highest confidence
        const itemIndex = enrichedItems.findIndex(ei => ei.itemId === item.itemId);
        
        if (itemIndex !== -1) {
          enrichedItems[itemIndex] = {
            ...enrichedItems[itemIndex],
            material: {
              ...enrichedItems[itemIndex].material,
              spec: bestCandidate.specification,
            },
            enrichmentData: {
              ...enrichedItems[itemIndex].enrichmentData,
              specCandidates: candidates,
              confidenceBoost: 0.15,
              enrichmentFlags: [],
              scheduleCandidates: [],
              calloutResolutions: [],
            },
          };
          specCandidatesFound++;
        }
      }
      
      onProgress?.(50 + ((i + 1) / itemsNeedingSpecs.length) * 40);
    }

    if (specCandidatesFound > 0) {
      flags.push({
        type: "ASSUMPTION",
        message: `Found specifications for ${specCandidatesFound} items`,
        severity: "low",
        sheets: [],
        resolved: true,
      });
    }

    onProgress?.(100);

    return {
      enrichedLineItems: enrichedItems,
      flags,
      confidence: specCandidatesFound / itemsNeedingSpecs.length,
    };
  }

  private async findSpecCandidates(
    item: TakeoffLineItem,
    specDocs: ProjectDocument[]
  ): Promise<SpecCandidate[]> {
    // Mock implementation - in real app would use AI to extract specs from PDFs
    const mockSpecs = [
      "Douglas Fir-Larch, Construction Grade",
      "Southern Pine, Stud Grade",
      "SPF, Construction Grade",
      "Engineered Lumber, LVL",
    ];

    const candidates: SpecCandidate[] = [];
    
    // Simulate finding relevant specs based on item context
    if (item.material.size?.includes("2x")) {
      candidates.push({
        id: `spec_${Date.now()}`,
        source: specDocs[0]?.name || "Specifications",
        specification: mockSpecs[Math.floor(Math.random() * mockSpecs.length)],
        confidence: 0.8 + Math.random() * 0.15,
        documentId: specDocs[0]?.id || "unknown",
        pageNumber: Math.floor(Math.random() * 10) + 1,
      });
    }

    return candidates.sort((a, b) => b.confidence - a.confidence);
  }
}

// ScheduleExtractor Module - Finds material schedules and quantities
class ScheduleExtractorModule implements EnrichmentModule {
  name = "ScheduleExtractor";

  async process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<EnrichmentResult> {
    onProgress?.(10);

    // Enhanced structural document detection
    const structuralDocs = context.projectDocuments.filter(doc => 
      doc.type === "structural" ||
      doc.name.toLowerCase().includes("struct") ||
      /S\d+/i.test(doc.name) || // S1, S2, S3, etc.
      doc.name.toLowerCase().includes("framing") ||
      doc.name.toLowerCase().includes("details") ||
      doc.name.toLowerCase().includes("schedule") ||
      doc.name.toLowerCase().includes("connection")
    );

    // If no structural documents found, use structural reasoning instead of failing
    if (structuralDocs.length === 0) {
      // Import and use structural reasoning module
      const structuralReasoning = new StructuralReasoningModule();
      
      try {
        const reasoningResult = await structuralReasoning.applyStructuralReasoning(lineItems, context);
        
        // Apply inferences to line items
        const enrichedItems = lineItems.map(item => {
        const itemInferences = reasoningResult.inferences.filter((inf: any) => 
          inf.field.includes("material.") && inf.originalValue !== undefined
        );
          
          if (itemInferences.length === 0) return item;
          
          const updatedMaterial = { ...item.material };
          const newAssumptions = [...item.assumptions];
          
          itemInferences.forEach((inference: any) => {
            const field = inference.field.replace("material.", "");
            (updatedMaterial as any)[field] = inference.inferredValue;
            newAssumptions.push(...inference.assumptions);
          });
          
          return {
            ...item,
            material: updatedMaterial,
            assumptions: newAssumptions,
            confidence: Math.min(item.confidence + 0.1, 0.95) // Slight confidence boost for reasoning
          };
        });
        
        return {
          enrichedLineItems: enrichedItems,
          flags: [
            ...reasoningResult.flags,
            {
              type: "ASSUMPTION",
              message: `Applied structural reasoning: ${reasoningResult.assumptionsApplied} assumptions made for missing S-series information`,
              severity: "low",
              sheets: ["All"],
              resolved: false,
            }
          ],
          confidence: reasoningResult.confidence,
        };
      } catch (error) {
        // Fallback to original behavior if reasoning fails
        return {
          enrichedLineItems: lineItems,
          flags: [{
            type: "MISSING_INFO",
            message: "No structural documents found and reasoning failed. Cannot extract header schedules, connector details, or nailing patterns.",
            severity: "medium",
            sheets: ["All"],
            resolved: false,
          }],
          confidence: 0,
        };
      }
    }

    onProgress?.(50);

    const enrichedItems = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let schedulesFound = 0;

    // Mock schedule extraction - would use AI to find actual schedules
    const mockSchedules: ScheduleCandidate[] = [
      {
        id: "sched_1",
        scheduleType: "Beam Schedule",
        items: [
          { mark: "B1", description: "Glulam Beam", size: "5.125x12", material: "DF-L", quantity: 8 },
          { mark: "B2", description: "Steel Beam", size: "W12x26", material: "A992", quantity: 4 },
        ],
        documentId: structuralDocs[0]?.id || "unknown",
        pageNumber: 3,
        confidence: 0.85,
      },
      {
        id: "sched_2",
        scheduleType: "Column Schedule",
        items: [
          { mark: "C1", description: "Wood Column", size: "6x6", material: "DF-L", quantity: 12 },
        ],
        documentId: structuralDocs[0]?.id || "unknown",
        pageNumber: 4,
        confidence: 0.78,
      },
    ];

    // Match line items to schedule items
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const matchingSchedule = this.findMatchingSchedule(item, mockSchedules);
      
      if (matchingSchedule) {
        const itemIndex = enrichedItems.findIndex(ei => ei.itemId === item.itemId);
        if (itemIndex !== -1) {
          enrichedItems[itemIndex] = {
            ...enrichedItems[itemIndex],
            enrichmentData: {
              ...enrichedItems[itemIndex].enrichmentData,
              scheduleCandidates: [matchingSchedule],
              confidenceBoost: 0.12,
              specCandidates: enrichedItems[itemIndex].enrichmentData?.specCandidates || [],
              calloutResolutions: enrichedItems[itemIndex].enrichmentData?.calloutResolutions || [],
              enrichmentFlags: [],
            },
          };
          schedulesFound++;
        }
      }
      
      onProgress?.(50 + ((i + 1) / lineItems.length) * 40);
    }

    if (schedulesFound > 0) {
      flags.push({
        type: "ASSUMPTION",
        message: `Matched ${schedulesFound} items to structural schedules`,
        severity: "low",
        sheets: [],
        resolved: true,
      });
    }

    onProgress?.(100);

    return {
      enrichedLineItems: enrichedItems,
      flags,
      confidence: schedulesFound / lineItems.length,
    };
  }

  private findMatchingSchedule(
    item: TakeoffLineItem,
    schedules: ScheduleCandidate[]
  ): ScheduleCandidate | null {
    // Simple matching logic - would be more sophisticated in real implementation
    for (const schedule of schedules) {
      for (const scheduleItem of schedule.items) {
        if (
          item.material.size === scheduleItem.size ||
          item.context.scope.toLowerCase().includes(scheduleItem.description.toLowerCase())
        ) {
          return schedule;
        }
      }
    }
    return null;
  }
}

// CalloutResolver Module - Resolves cross-references between documents
class CalloutResolverModule implements EnrichmentModule {
  name = "CalloutResolver";

  async process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<EnrichmentResult> {
    onProgress?.(20);

    const enrichedItems = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let calloutsResolved = 0;

    // Mock callout resolution - would use AI to find actual cross-references
    const mockCallouts: CalloutResolution[] = [
      {
        callout: "See Detail 3/A5.1",
        resolvedTo: "Typical Wall Framing Detail",
        confidence: 0.9,
        sourceDocument: "Architectural Plans",
        targetDocument: "Detail Sheets",
      },
      {
        callout: "Typ. per S-1",
        resolvedTo: "Structural General Notes",
        confidence: 0.85,
        sourceDocument: "Floor Plans",
        targetDocument: "Structural Plans",
      },
    ];

    onProgress?.(60);

    // Apply callout resolutions to items that reference them
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const relevantCallouts = mockCallouts.filter(callout =>
        item.context.sourceNotes.some(note =>
          note.toLowerCase().includes(callout.callout.toLowerCase().substring(0, 10))
        )
      );

      if (relevantCallouts.length > 0) {
        const itemIndex = enrichedItems.findIndex(ei => ei.itemId === item.itemId);
        if (itemIndex !== -1) {
          enrichedItems[itemIndex] = {
            ...enrichedItems[itemIndex],
            enrichmentData: {
              ...enrichedItems[itemIndex].enrichmentData,
              calloutResolutions: relevantCallouts,
              confidenceBoost: (enrichedItems[itemIndex].enrichmentData?.confidenceBoost || 0) + 0.08,
              specCandidates: enrichedItems[itemIndex].enrichmentData?.specCandidates || [],
              scheduleCandidates: enrichedItems[itemIndex].enrichmentData?.scheduleCandidates || [],
              enrichmentFlags: [],
            },
          };
          calloutsResolved++;
        }
      }
      
      onProgress?.(60 + ((i + 1) / lineItems.length) * 30);
    }

    if (calloutsResolved > 0) {
      flags.push({
        type: "ASSUMPTION",
        message: `Resolved ${calloutsResolved} callout references`,
        severity: "low",
        sheets: [],
        resolved: true,
      });
    }

    onProgress?.(100);

    return {
      enrichedLineItems: enrichedItems,
      flags,
      confidence: calloutsResolved / lineItems.length,
    };
  }
}

// Link items to systems (joist/roof/sheathing)
class SystemsLinkerModule implements EnrichmentModule {
  name = "SystemsLinker";
  async process(lineItems: TakeoffLineItem[], context: EnrichmentContext, onProgress?: (p: number) => void) {
    const enriched = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let linked = 0;
    const total = Math.max(1, lineItems.length);

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const sys = matchSystem(item, context);
      if (sys) {
        const idx = enriched.findIndex(e => e.itemId === item.itemId);
        if (idx !== -1) {
          enriched[idx] = {
            ...enriched[idx],
            assumptions: [...(enriched[idx].assumptions || []), `System match: ${sys.type}:${sys.id}`],
            enrichmentData: {
              ...enriched[idx].enrichmentData,
              enrichmentFlags: [
                ...((enriched[idx].enrichmentData?.enrichmentFlags) || []),
                {
                  type: "EVIDENCE_ENHANCED",
                  message: `Matched to ${sys.type} system ${sys.id}`,
                  severity: "low",
                  sheets: [],
                  moduleSource: this.name,
                  resolved: true,
                },
              ],
              specCandidates: enriched[idx].enrichmentData?.specCandidates || [],
              scheduleCandidates: enriched[idx].enrichmentData?.scheduleCandidates || [],
              calloutResolutions: enriched[idx].enrichmentData?.calloutResolutions || [],
              confidenceBoost: (enriched[idx].enrichmentData?.confidenceBoost || 0) + 0.08,
            },
          };
          linked++;
        }
      }
      onProgress?.((i + 1) / total * 100);
    }

    if (linked === 0) {
      flags.push({
        type: "MISSING_INFO",
        message: "No systems matched to items",
        severity: "low",
        sheets: [],
        resolved: false,
      });
    }

    return { enrichedLineItems: enriched, flags, confidence: linked / total };
  }
}

// Enrich from hangers/bridging details on joist/rafter systems
class HangerAndBlockingEnricherModule implements EnrichmentModule {
  name = "HangerAndBlockingEnricher";
  async process(lineItems: TakeoffLineItem[], context: EnrichmentContext, onProgress?: (p: number) => void) {
    const enriched = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let improved = 0;

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const sys = matchSystem(item, context);
      if (sys && (sys.type === "joist" || sys.type === "roof")) {
        const idx = enriched.findIndex(e => e.itemId === item.itemId);
        if (idx !== -1) {
          const hangerMsg = (sys.data?.hangerType || sys.data?.hangerSize)
            ? `Hanger ${sys.data?.hangerType || ''} ${sys.data?.hangerSize || ''}`.trim()
            : null;

          const blockingCount = calcBlocking(sys.data?.joistLength, sys.data?.blockingSpacing);
          const derivations: string[] = [];
          if (hangerMsg) derivations.push(hangerMsg);
          if (blockingCount) derivations.push(`Blocking count ~ ${blockingCount}`);

          if (derivations.length > 0) {
            enriched[idx] = {
              ...enriched[idx],
              assumptions: [...(enriched[idx].assumptions || []), ...derivations],
              enrichmentData: {
                ...enriched[idx].enrichmentData,
                enrichmentFlags: [
                  ...((enriched[idx].enrichmentData?.enrichmentFlags) || []),
                  {
                    type: "EVIDENCE_ENHANCED",
                    message: `Applied system-derived details (${derivations.join(", ")})`,
                    severity: "low",
                    sheets: [],
                    moduleSource: this.name,
                    resolved: true,
                  },
                ],
                specCandidates: enriched[idx].enrichmentData?.specCandidates || [],
                scheduleCandidates: enriched[idx].enrichmentData?.scheduleCandidates || [],
                calloutResolutions: enriched[idx].enrichmentData?.calloutResolutions || [],
                confidenceBoost: (enriched[idx].enrichmentData?.confidenceBoost || 0) + 0.07,
              },
            };
            improved++;
          } else {
            flags.push({
              type: "MISSING_INFO",
              message: `System matched but missing hanger/blocking specifics for ${sys.id}`,
              severity: "low",
              sheets: [],
              resolved: false,
            });
          }
        }
      }
      onProgress?.(((i + 1) / Math.max(1, lineItems.length)) * 100);
    }

    return { enrichedLineItems: enriched, flags, confidence: improved / Math.max(1, lineItems.length) };
  }
}

// Compute fastener quantities from sheathing systems patterns
class SheathingFastenerEnricherModule implements EnrichmentModule {
  name = "SheathingFastenerEnricher";
  async process(lineItems: TakeoffLineItem[], context: EnrichmentContext, onProgress?: (p: number) => void) {
    const enriched = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let updated = 0;

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const sys = matchSheathing(item, context);
      if (sys) {
        const idx = enriched.findIndex(e => e.itemId === item.itemId);
        const spacing = parseSpacing(sys.nailingPattern || `${sys.edgeSpacing || ''}/${sys.fieldSpacing || ''}`);
        const sheetArea = (sys.width && sys.length) ? (Number(sys.width) * Number(sys.length)) : null;
        let qtyEstimate: number | undefined = undefined;
        if (sheetArea && item.uom === "SF" && typeof item.qty === "number" && spacing) {
          const sheets = Math.max(1, Math.ceil(item.qty / sheetArea));
          qtyEstimate = estimateFastenersPerSheet(spacing) * sheets;
        }

        if (idx !== -1) {
          enriched[idx] = {
            ...enriched[idx],
            nailingSchedule: {
              ...(enriched[idx].nailingSchedule || {}),
              type: enriched[idx].nailingSchedule?.type || "Nails",
              size: enriched[idx].nailingSchedule?.size || (sys.fastenerSize || "8d"),
              spacing: enriched[idx].nailingSchedule?.spacing || (spacing ? `${spacing.edge}/${spacing.field}` : ""),
              pattern: enriched[idx].nailingSchedule?.pattern || (sys.nailingPattern || ""),
              quantity: enriched[idx].nailingSchedule?.quantity || qtyEstimate,
              galvanized: enriched[idx].nailingSchedule?.galvanized || false,
              sheetRef: enriched[idx].nailingSchedule?.sheetRef || undefined,
            },
            enrichmentData: {
              ...enriched[idx].enrichmentData,
              enrichmentFlags: [
                ...((enriched[idx].enrichmentData?.enrichmentFlags) || []),
                {
                  type: qtyEstimate ? "EVIDENCE_ENHANCED" : "CONFIDENCE_IMPROVED",
                  message: qtyEstimate ? `Computed fastener qty ≈ ${qtyEstimate}` : "Insufficient data to compute fasteners",
                  severity: qtyEstimate ? "low" : "medium",
                  sheets: [],
                  moduleSource: this.name,
                  resolved: Boolean(qtyEstimate),
                },
              ],
              specCandidates: enriched[idx].enrichmentData?.specCandidates || [],
              scheduleCandidates: enriched[idx].enrichmentData?.scheduleCandidates || [],
              calloutResolutions: enriched[idx].enrichmentData?.calloutResolutions || [],
              confidenceBoost: (enriched[idx].enrichmentData?.confidenceBoost || 0) + (qtyEstimate ? 0.1 : 0.03),
            },
          };
          updated++;
        }
      }
      onProgress?.(((i + 1) / Math.max(1, lineItems.length)) * 100);
    }

    return { enrichedLineItems: enriched, flags, confidence: updated / Math.max(1, lineItems.length) };
  }
}

// Merge connector and fastener schedules into items
class ConnectorScheduleMergerModule implements EnrichmentModule {
  name = "ConnectorScheduleMerger";
  async process(lineItems: TakeoffLineItem[], context: EnrichmentContext, onProgress?: (p: number) => void) {
    const enriched = [...lineItems];
    const flags: TakeoffFlag[] = [];

    const connectors = (context.baselineAnalysis?.connectorSchedules || []) as any[];
    const fasteners = (context.baselineAnalysis?.fastenerSchedules || []) as any[];

    let matches = 0;
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const idx = enriched.findIndex(e => e.itemId === item.itemId);
      if (idx === -1) continue;

      const matchedConnectors = connectors.filter(c =>
        (c.sheetRef && c.sheetRef === item.context.sheetRef) ||
        (c.type && item.material.connectorType && c.type.toLowerCase().includes(String(item.material.connectorType).toLowerCase()))
      );

      const matchedFasteners = fasteners.filter(f =>
        (f.sheetRef && f.sheetRef === item.context.sheetRef) ||
        (f.type && item.material.fastenerType && f.type.toLowerCase().includes(String(item.material.fastenerType).toLowerCase()))
      );

      if (matchedConnectors.length > 0 || matchedFasteners.length > 0) {
        enriched[idx] = {
          ...enriched[idx],
          enrichmentData: {
            ...enriched[idx].enrichmentData,
            scheduleCandidates: [
              ...((enriched[idx].enrichmentData?.scheduleCandidates) || []),
              ...matchedConnectors.map((mc: any) => ({ id: mc.mark || mc.type, scheduleType: "Connector", items: [], documentId: mc.sheetRef || "", pageNumber: 0, confidence: 0.9 })),
              ...matchedFasteners.map((mf: any) => ({ id: mf.type, scheduleType: "Fastener", items: [], documentId: mf.sheetRef || "", pageNumber: 0, confidence: 0.85 })),
            ],
            confidenceBoost: (enriched[idx].enrichmentData?.confidenceBoost || 0) + 0.12,
            specCandidates: enriched[idx].enrichmentData?.specCandidates || [],
            calloutResolutions: enriched[idx].enrichmentData?.calloutResolutions || [],
            enrichmentFlags: [
              ...((enriched[idx].enrichmentData?.enrichmentFlags) || []),
              {
                type: "EVIDENCE_ENHANCED",
                message: `Merged ${matchedConnectors.length} connectors and ${matchedFasteners.length} fasteners`,
                severity: "low",
                sheets: [],
                moduleSource: this.name,
                resolved: true,
              },
            ],
          },
        };
        matches++;
      }
      onProgress?.(((i + 1) / Math.max(1, lineItems.length)) * 100);
    }

    return { enrichedLineItems: enriched, flags: [] as unknown as TakeoffFlag[], confidence: matches / Math.max(1, lineItems.length) };
  }
}

// Helpers
function matchSystem(item: TakeoffLineItem, context: EnrichmentContext): { id: string; type: "joist"|"roof"|"sheathing"; data: any } | null {
  const level = (item.context.level || "").toLowerCase();
  const scope = (item.context.scope || "").toLowerCase();

  const joists = (context.baselineAnalysis?.joistSystems || []) as any[];
  const roofs = (context.baselineAnalysis?.roofFraming || []) as any[];
  const sheathing = (context.baselineAnalysis?.sheathingSystems || []) as any[];

  const j = joists.find(js =>
    (js.description?.toLowerCase().includes(scope) || scope.includes("joist"))
  );
  if (j) return { id: j.id, type: "joist", data: j };

  const r = roofs.find(rf =>
    (rf.description?.toLowerCase().includes(scope) || scope.includes("rafter") || scope.includes("roof"))
  );
  if (r) return { id: r.id, type: "roof", data: r };

  const s = sheathing.find(sh =>
    (sh.description?.toLowerCase().includes(scope) || (item.material.sheathingGrade || item.material.nailingPattern))
  );
  if (s) return { id: s.id, type: "sheathing", data: s };

  return null;
}

function matchSheathing(item: TakeoffLineItem, context: EnrichmentContext): any | null {
  const sheathing = (context.baselineAnalysis?.sheathingSystems || []) as any[];
  const sheetRef = item.context.sheetRef?.toLowerCase() || "";
  return sheathing.find(sh =>
    (sh.sheetRef && String(sh.sheetRef).toLowerCase() === sheetRef) ||
    (item.material.sheathingGrade && sh.grade && String(sh.grade).toLowerCase() === String(item.material.sheathingGrade).toLowerCase()) ||
    (item.material.nailingPattern && sh.nailingPattern && String(sh.nailingPattern).toLowerCase() === String(item.material.nailingPattern).toLowerCase())
  ) || null;
}

function parseSpacing(pattern: string | undefined): { edge: number; field: number } | null {
  if (!pattern) return null;
  const m = pattern.replace(/\s|\"|in\.|inches/gi, "").match(/(\d+)[\/x-]?(\d+)?/);
  if (!m) return null;
  const edge = Number(m[1]);
  const field = Number(m[2] || m[1]);
  if (isNaN(edge) || isNaN(field)) return null;
  return { edge, field };
}

function estimateFastenersPerSheet(spacing: { edge: number; field: number }): number {
  // Rough heuristic: perimeter nails every edge inches around 4x8, field nails on grid
  const sheetW = 48; const sheetL = 96; // inches
  const perim = Math.floor((sheetW * 2 + sheetL * 2) / spacing.edge);
  const grid = Math.floor((sheetW / spacing.field) * (sheetL / spacing.field));
  return perim + grid;
}

function calcBlocking(joistLength?: number, blockingSpacing?: number): number | undefined {
  if (!joistLength || !blockingSpacing || blockingSpacing <= 0) return undefined;
  return Math.max(0, Math.ceil(joistLength / blockingSpacing) - 1);
}

// Drawing Understanding Modules

// Classify pages and extract drawing metadata
class DrawingPageClassifierModule implements EnrichmentModule {
  name = "DrawingPageClassifier";
  
  async process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<EnrichmentResult> {
    const enriched = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let analyzed = 0;

    onProgress?.(10);

    // Find architectural and structural documents for drawing analysis
    const drawingDocs = context.projectDocuments.filter(
      doc => doc.type === "architectural" || doc.type === "structural"
    );

    if (drawingDocs.length === 0) {
      return {
        enrichedLineItems: enriched,
        flags: [{
          type: "MISSING_INFO",
          message: "No architectural or structural drawings found for analysis",
          severity: "medium",
          sheets: [],
          resolved: false,
        }],
        confidence: 0,
      };
    }

    onProgress?.(50);

    // Analyze each drawing document
    for (let i = 0; i < drawingDocs.length; i++) {
      const doc = drawingDocs[i];
      try {
        const analysis = await drawingUnderstandingService.analyzeDocument(
          doc,
          context,
          (progress) => onProgress?.(50 + (i / drawingDocs.length) * 40 * (progress / 100))
        );

        // Store analysis in evidence store for other modules
        const cacheKey = `drawing_analysis_${doc.id}`;
        this.storeDrawingAnalysis(cacheKey, analysis);
        analyzed++;

        // Add flags from drawing analysis
        analysis.flags.forEach(flag => {
          flags.push({
            type: "ASSUMPTION",
            message: `Drawing analysis: ${flag.message}`,
            severity: flag.severity,
            sheets: [doc.name],
            resolved: flag.resolved,
          });
        });

      } catch (error) {
        flags.push({
          type: "ASSUMPTION",
          message: `Failed to analyze drawing ${doc.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
          severity: "medium",
          sheets: [doc.name],
          resolved: false,
        });
      }
    }

    onProgress?.(100);

    return {
      enrichedLineItems: enriched,
      flags,
      confidence: analyzed / drawingDocs.length,
    };
  }

  private storeDrawingAnalysis(key: string, analysis: DrawingAnalysis): void {
    // Store in a way that other modules can access
    (globalThis as any).__drawingAnalysisCache = (globalThis as any).__drawingAnalysisCache || new Map();
    (globalThis as any).__drawingAnalysisCache.set(key, analysis);
  }
}

// Extract geometric entities and link to line items
class GeometryExtractionModule implements EnrichmentModule {
  name = "GeometryExtraction";

  async process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<EnrichmentResult> {
    const enriched = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let enhanced = 0;

    onProgress?.(10);

    // Get drawing analyses from previous module
    const drawingAnalyses = this.getStoredDrawingAnalyses(context.projectDocuments);
    
    if (drawingAnalyses.length === 0) {
      return {
        enrichedLineItems: enriched,
        flags: [{
          type: "MISSING_INFO",
          message: "No drawing geometry available for enhancement",
          severity: "low",
          sheets: [],
          resolved: false,
        }],
        confidence: 0,
      };
    }

    onProgress?.(30);

    // Extract all geometric entities
    const allEntities: GeoEntity[] = [];
    drawingAnalyses.forEach(analysis => {
      analysis.pages.forEach(page => {
        allEntities.push(...page.entities);
      });
    });

    onProgress?.(50);

    // Link entities to line items
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const matchedEntities = this.findMatchingEntities(item, allEntities);
      
      if (matchedEntities.length > 0) {
        const idx = enriched.findIndex(e => e.itemId === item.itemId);
        if (idx !== -1) {
          enriched[idx] = {
            ...enriched[idx],
            enrichmentData: {
              ...enriched[idx].enrichmentData,
              enrichmentFlags: [
                ...((enriched[idx].enrichmentData?.enrichmentFlags) || []),
                {
                  type: "EVIDENCE_ENHANCED",
                  message: `Linked to ${matchedEntities.length} geometric entities from drawings`,
                  severity: "low",
                  sheets: [],
                  moduleSource: this.name,
                  resolved: true,
                },
              ],
              specCandidates: enriched[idx].enrichmentData?.specCandidates || [],
              scheduleCandidates: enriched[idx].enrichmentData?.scheduleCandidates || [],
              calloutResolutions: enriched[idx].enrichmentData?.calloutResolutions || [],
              confidenceBoost: (enriched[idx].enrichmentData?.confidenceBoost || 0) + 0.15,
            },
            // Store geometric evidence
            evidenceRefs: [
              ...enriched[idx].evidenceRefs,
              ...matchedEntities.map(entity => ({
                documentId: entity.sourceSheet,
                pageNumber: 1, // TODO: Get actual page number
                coordinates: [entity.evidenceBox.x, entity.evidenceBox.y, entity.evidenceBox.width, entity.evidenceBox.height] as [number, number, number, number],
                description: `${entity.type} entity with confidence ${entity.confidence.toFixed(2)}`,
              })),
            ],
          };
          enhanced++;
        }
      }
      
      onProgress?.(50 + ((i + 1) / lineItems.length) * 40);
    }

    if (enhanced > 0) {
      flags.push({
        type: "ASSUMPTION",
        message: `Enhanced ${enhanced} items with geometric evidence from drawings`,
        severity: "low",
        sheets: [],
        resolved: true,
      });
    }

    onProgress?.(100);

    return {
      enrichedLineItems: enriched,
      flags,
      confidence: enhanced / Math.max(1, lineItems.length),
    };
  }

  private getStoredDrawingAnalyses(documents: ProjectDocument[]): DrawingAnalysis[] {
    const cache = (globalThis as any).__drawingAnalysisCache as Map<string, DrawingAnalysis>;
    if (!cache) return [];

    const analyses: DrawingAnalysis[] = [];
    documents.forEach(doc => {
      const key = `drawing_analysis_${doc.id}`;
      const analysis = cache.get(key);
      if (analysis) analyses.push(analysis);
    });

    return analyses;
  }

  private findMatchingEntities(item: TakeoffLineItem, entities: GeoEntity[]): GeoEntity[] {
    const matches: GeoEntity[] = [];
    const scope = item.context.scope.toLowerCase();
    const sheetRef = item.context.sheetRef.toLowerCase();

    entities.forEach(entity => {
      let score = 0;

      // Match by entity type to item scope
      if (entity.type === "wall" && (scope.includes("wall") || scope.includes("stud"))) {
        score += 0.8;
      } else if (entity.type === "opening" && (scope.includes("door") || scope.includes("window"))) {
        score += 0.8;
      } else if (entity.type === "framing_member" && (scope.includes("joist") || scope.includes("rafter"))) {
        score += 0.8;
      }

      // Match by sheet reference
      if (entity.sourceSheet.toLowerCase().includes(sheetRef) || sheetRef.includes(entity.sourceSheet.toLowerCase())) {
        score += 0.3;
      }

      // Match by material properties
      if (entity.type === "wall" && item.material.size?.includes("2x")) {
        score += 0.2;
      }

      if (score > 0.5) {
        matches.push(entity);
      }
    });

    return matches.sort((a, b) => b.confidence - a.confidence);
  }
}

// Reconcile drawing geometry with baseline text analysis
class BaselineReconciliationModule implements EnrichmentModule {
  name = "BaselineReconciliation";

  async process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<EnrichmentResult> {
    const enriched = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let reconciled = 0;

    onProgress?.(20);

    // Get drawing analyses
    const drawingAnalyses = this.getStoredDrawingAnalyses(context.projectDocuments);
    
    if (drawingAnalyses.length === 0) {
      return {
        enrichedLineItems: enriched,
        flags: [],
        confidence: 0,
      };
    }

    onProgress?.(40);

    // Reconcile quantities with geometric measurements
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const reconciliation = this.reconcileItemWithGeometry(item, drawingAnalyses);
      
      if (reconciliation.hasConflict || reconciliation.hasEnhancement) {
        const idx = enriched.findIndex(e => e.itemId === item.itemId);
        if (idx !== -1) {
          enriched[idx] = {
            ...enriched[idx],
            assumptions: [
              ...enriched[idx].assumptions,
              ...reconciliation.assumptions,
            ],
            enrichmentData: {
              ...enriched[idx].enrichmentData,
              enrichmentFlags: [
                ...((enriched[idx].enrichmentData?.enrichmentFlags) || []),
                {
                  type: reconciliation.hasConflict ? "CONFIDENCE_IMPROVED" : "EVIDENCE_ENHANCED",
                  message: reconciliation.message,
                  severity: reconciliation.hasConflict ? "medium" : "low",
                  sheets: [],
                  moduleSource: this.name,
                  resolved: !reconciliation.hasConflict,
                },
              ],
              specCandidates: enriched[idx].enrichmentData?.specCandidates || [],
              scheduleCandidates: enriched[idx].enrichmentData?.scheduleCandidates || [],
              calloutResolutions: enriched[idx].enrichmentData?.calloutResolutions || [],
              confidenceBoost: (enriched[idx].enrichmentData?.confidenceBoost || 0) + reconciliation.confidenceAdjustment,
            },
          };
          reconciled++;
        }
      }
      
      onProgress?.(40 + ((i + 1) / lineItems.length) * 50);
    }

    onProgress?.(100);

    return {
      enrichedLineItems: enriched,
      flags,
      confidence: reconciled / Math.max(1, lineItems.length),
    };
  }

  private getStoredDrawingAnalyses(documents: ProjectDocument[]): DrawingAnalysis[] {
    const cache = (globalThis as any).__drawingAnalysisCache as Map<string, DrawingAnalysis>;
    if (!cache) return [];

    const analyses: DrawingAnalysis[] = [];
    documents.forEach(doc => {
      const key = `drawing_analysis_${doc.id}`;
      const analysis = cache.get(key);
      if (analysis) analyses.push(analysis);
    });

    return analyses;
  }

  private reconcileItemWithGeometry(
    item: TakeoffLineItem,
    analyses: DrawingAnalysis[]
  ): {
    hasConflict: boolean;
    hasEnhancement: boolean;
    message: string;
    assumptions: string[];
    confidenceAdjustment: number;
  } {
    const result = {
      hasConflict: false,
      hasEnhancement: false,
      message: "",
      assumptions: [] as string[],
      confidenceAdjustment: 0,
    };

    // NEW: Check for vision analysis conflicts
    const visionEvidence = item.evidenceRefs.filter(ref => 
      ref.description.includes("Vision analysis")
    );

    if (visionEvidence.length > 0) {
      // Compare vision results with baseline analysis
      const visionConflicts = this.checkVisionConflicts(item, visionEvidence);
      if (visionConflicts.length > 0) {
        result.hasConflict = true;
        result.message = `Vision analysis conflicts: ${visionConflicts.join(", ")}`;
        result.confidenceAdjustment = -0.1;
      } else {
        result.hasEnhancement = true;
        result.message = "Vision analysis confirms baseline measurements";
        result.confidenceAdjustment = 0.15; // Higher boost for vision confirmation
      }
    }

    // Find relevant geometric entities
    const relevantEntities: GeoEntity[] = [];
    analyses.forEach(analysis => {
      analysis.pages.forEach(page => {
        page.entities.forEach(entity => {
          if (this.isEntityRelevantToItem(entity, item)) {
            relevantEntities.push(entity);
          }
        });
      });
    });

    if (relevantEntities.length === 0) {
    return result;
  }



    // Reconcile wall quantities
    if (item.context.scope.toLowerCase().includes("wall")) {
      const wallEntities = relevantEntities.filter(e => e.type === "wall") as WallPolyline[];
      if (wallEntities.length > 0) {
        const geometricLength = wallEntities.reduce((sum, wall) => sum + (wall.properties.length || 0), 0);
        const textQuantity = item.qty;
        
        if (item.uom === "LF" && Math.abs(geometricLength - textQuantity) > textQuantity * 0.1) {
          result.hasConflict = true;
          result.message = `Quantity mismatch: text analysis ${textQuantity} LF vs drawing measurement ${geometricLength.toFixed(1)} LF`;
          result.assumptions.push(`Drawing measurement: ${geometricLength.toFixed(1)} LF`);
          result.confidenceAdjustment = -0.1;
        } else {
          result.hasEnhancement = true;
          result.message = `Quantity confirmed by drawing measurement: ${geometricLength.toFixed(1)} LF`;
          result.confidenceAdjustment = 0.1;
        }
      }
    }

    // Reconcile opening quantities
    if (item.context.scope.toLowerCase().includes("door") || item.context.scope.toLowerCase().includes("window")) {
      const openingEntities = relevantEntities.filter(e => e.type === "opening") as Opening[];
      if (openingEntities.length > 0) {
        const geometricCount = openingEntities.length;
        const textQuantity = item.qty;
        
        if (item.uom === "EA" && Math.abs(geometricCount - textQuantity) > 0) {
          result.hasConflict = true;
          result.message = `Count mismatch: text analysis ${textQuantity} EA vs drawing count ${geometricCount} EA`;
          result.assumptions.push(`Drawing count: ${geometricCount} EA`);
          result.confidenceAdjustment = -0.05;
        } else {
          result.hasEnhancement = true;
          result.message = `Count confirmed by drawing: ${geometricCount} EA`;
          result.confidenceAdjustment = 0.05;
        }
      }
    }

    return result;
  }

  private isEntityRelevantToItem(entity: GeoEntity, item: TakeoffLineItem): boolean {
    const scope = item.context.scope.toLowerCase();
    const sheetRef = item.context.sheetRef.toLowerCase();

    // Match by type
    if (entity.type === "wall" && scope.includes("wall")) return true;
    if (entity.type === "opening" && (scope.includes("door") || scope.includes("window"))) return true;
    if (entity.type === "framing_member" && (scope.includes("joist") || scope.includes("rafter"))) return true;

    // Match by sheet reference
    if (entity.sourceSheet.toLowerCase().includes(sheetRef)) return true;

    return false;
  }

  private checkVisionConflicts(item: TakeoffLineItem, visionEvidence: EvidenceReference[]): string[] {
    const conflicts: string[] = [];

    // Check for conflicts between vision analysis and baseline data
    for (const evidence of visionEvidence) {
      if (evidence.description.includes("conflicts")) {
        // Extract conflict information from evidence description
        const conflictMatch = evidence.description.match(/conflicts: (.+)/);
        if (conflictMatch) {
          conflicts.push(conflictMatch[1]);
        }
      }
    }

    return conflicts;
  }
}

// Expert Gap Analysis Module - Identifies missing materials and specifications
class ExpertGapAnalysisModule implements EnrichmentModule {
  name = "ExpertGapAnalysis";

  async process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<EnrichmentResult> {
    const enriched = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let gapsIdentified = 0;

    onProgress?.(20);

    // Analyze baseline reconciliation results to identify gaps
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const gaps = this.identifyGaps(item, context);
      
      if (gaps.length > 0) {
        const idx = enriched.findIndex(e => e.itemId === item.itemId);
        if (idx !== -1) {
          enriched[idx] = {
            ...enriched[idx],
            enrichmentData: {
              specCandidates: enriched[idx].enrichmentData?.specCandidates || [],
              scheduleCandidates: enriched[idx].enrichmentData?.scheduleCandidates || [],
              calloutResolutions: enriched[idx].enrichmentData?.calloutResolutions || [],
              confidenceBoost: (enriched[idx].enrichmentData?.confidenceBoost || 0) + 0.05,
              enrichmentFlags: enriched[idx].enrichmentData?.enrichmentFlags || [],
              identifiedGaps: gaps,
              gapAnalysisFlags: gaps.map(gap => ({
                type: "MISSING_INFO" as const,
                message: gap.description,
                severity: gap.severity,
                sheets: [],
                moduleSource: this.name,
                resolved: false,
                suggestedAction: gap.suggestedAction,
              })),
            },
          };
          gapsIdentified++;
        }
      }
      
      onProgress?.(20 + ((i + 1) / lineItems.length) * 70);
    }

    onProgress?.(100);

    return {
      enrichedLineItems: enriched,
      flags,
      confidence: gapsIdentified / Math.max(1, lineItems.length),
    };
  }

  private identifyGaps(item: TakeoffLineItem, context: EnrichmentContext): Array<{
    field: string;
    description: string;
    severity: "low" | "medium" | "high";
    suggestedAction: string;
  }> {
    const gaps: Array<{
      field: string;
      description: string;
      severity: "low" | "medium" | "high";
      suggestedAction: string;
    }> = [];

    // Check for missing material specifications
    if (!item.material.spec || item.material.spec === "Unknown") {
      gaps.push({
        field: "material.spec",
        description: "Missing material specification - need drawing analysis to determine size",
        severity: "high",
        suggestedAction: "Analyze drawings for material dimensions and specifications"
      });
    }

    if (!item.material.grade) {
      gaps.push({
        field: "material.grade",
        description: "Missing material grade - need to determine structural requirements",
        severity: "medium",
        suggestedAction: "Check specifications or apply default structural grade"
      });
    }

    if (!item.material.species) {
      gaps.push({
        field: "material.species",
        description: "Missing wood species - need to determine regional availability",
        severity: "low",
        suggestedAction: "Apply regional default species (SPF, Douglas Fir, etc.)"
      });
    }

    // Check for missing construction details
    if (item.context.scope.toLowerCase().includes("wall") && !item.material.nailingPattern) {
      gaps.push({
        field: "material.nailingPattern",
        description: "Missing nailing pattern for sheathing - need code compliance details",
        severity: "medium",
        suggestedAction: "Check building code tables or apply typical residential patterns"
      });
    }

    if (item.context.scope.toLowerCase().includes("header") && !item.material.bearingLength) {
      gaps.push({
        field: "material.bearingLength",
        description: "Missing header bearing length - need structural analysis",
        severity: "high",
        suggestedAction: "Calculate from wall thickness or apply code minimums"
      });
    }

    // Check for missing quantities or measurements
    if (item.qty <= 0 || !item.qty) {
      gaps.push({
        field: "qty",
        description: "Missing or invalid quantity - need geometric analysis",
        severity: "high",
        suggestedAction: "Measure from drawings or calculate from dimensions"
      });
    }

    return gaps;
  }
}

// Advanced Reasoning Module - Uses expert knowledge to fill gaps
class AdvancedReasoningModule implements EnrichmentModule {
  name = "AdvancedReasoning";

  async process(
    lineItems: TakeoffLineItem[],
    context: EnrichmentContext,
    onProgress?: (progress: number) => void
  ): Promise<EnrichmentResult> {
    const enriched = [...lineItems];
    const flags: TakeoffFlag[] = [];
    let reasoningApplied = 0;

    onProgress?.(20);

    // Apply expert reasoning to fill identified gaps
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const reasoning = this.applyExpertReasoning(item, context);
      
      if (reasoning.applied) {
        const idx = enriched.findIndex(e => e.itemId === item.itemId);
        if (idx !== -1) {
          enriched[idx] = {
            ...enriched[idx],
            material: { ...enriched[idx].material, ...reasoning.materialUpdates },
            context: { ...enriched[idx].context, ...reasoning.contextUpdates },
            assumptions: [...enriched[idx].assumptions, ...reasoning.assumptions],
            enrichmentData: {
              specCandidates: enriched[idx].enrichmentData?.specCandidates || [],
              scheduleCandidates: enriched[idx].enrichmentData?.scheduleCandidates || [],
              calloutResolutions: enriched[idx].enrichmentData?.calloutResolutions || [],
              confidenceBoost: (enriched[idx].enrichmentData?.confidenceBoost || 0) + reasoning.confidenceBoost,
              enrichmentFlags: enriched[idx].enrichmentData?.enrichmentFlags || [],
              identifiedGaps: enriched[idx].enrichmentData?.identifiedGaps || [],
              gapAnalysisFlags: enriched[idx].enrichmentData?.gapAnalysisFlags || [],
              expertReasoning: reasoning.reasoning,
            },
          };
          reasoningApplied++;
        }
      }
      
      onProgress?.(20 + ((i + 1) / lineItems.length) * 70);
    }

    onProgress?.(100);

    return {
      enrichedLineItems: enriched,
      flags,
      confidence: reasoningApplied / Math.max(1, lineItems.length),
    };
  }

  private applyExpertReasoning(
    item: TakeoffLineItem, 
    context: EnrichmentContext
  ): {
    applied: boolean;
    materialUpdates: Partial<{
      spec: string;
      grade: string;
      species: string;
      edgeSpacing: string;
      fieldSpacing: string;
      bearingLength: number;
      cornerStuds: number;
      tIntersectionStuds: number;
    }>;
    contextUpdates: any;
    assumptions: string[];
    reasoning: string[];
    confidenceBoost: number;
  } {
    const result = {
      applied: false,
      materialUpdates: {} as Partial<{
        spec: string;
        grade: string;
        species: string;
        edgeSpacing: string;
        fieldSpacing: string;
        bearingLength: number;
        cornerStuds: number;
        tIntersectionStuds: number;
      }>,
      contextUpdates: {},
      assumptions: [] as string[],
      reasoning: [] as string[],
      confidenceBoost: 0,
    };

    const scope = item.context.scope.toLowerCase();
    const gaps = item.enrichmentData?.identifiedGaps || [];

    // Apply expert reasoning for each identified gap
    gaps.forEach(gap => {
      switch (gap.field) {
        case "material.spec":
          if (scope.includes("stud")) {
            result.materialUpdates.spec = "2x4";
            result.assumptions.push("Applied typical stud size 2x4 based on scope");
            result.reasoning.push("Light framing typically uses 2x4 studs unless specified otherwise");
            result.confidenceBoost += 0.1;
          } else if (scope.includes("plate")) {
            result.materialUpdates.spec = "2x4";
            result.assumptions.push("Applied typical plate size 2x4");
            result.reasoning.push("Plates typically match stud dimensions");
            result.confidenceBoost += 0.1;
          } else if (scope.includes("header")) {
            // Infer header size from opening width if available
            const openingWidth = this.extractOpeningWidthFromItem(item);
            if (openingWidth && openingWidth <= 48) {
              result.materialUpdates.spec = "2x8";
              result.assumptions.push(`Applied 2x8 header for ${openingWidth}" opening`);
              result.reasoning.push("2x8 header adequate for openings up to 4 feet");
              result.confidenceBoost += 0.15;
            } else if (openingWidth && openingWidth <= 72) {
              result.materialUpdates.spec = "(2) 2x10";
              result.assumptions.push(`Applied double 2x10 header for ${openingWidth}" opening`);
              result.reasoning.push("Double 2x10 header required for openings 4-6 feet");
              result.confidenceBoost += 0.15;
            } else {
              result.materialUpdates.spec = "2x8";
              result.assumptions.push("Applied typical header size 2x8");
              result.reasoning.push("2x8 header assumed for standard residential opening");
              result.confidenceBoost += 0.1;
            }
          } else if (scope.includes("joist")) {
            result.materialUpdates.spec = "2x10";
            result.assumptions.push("Applied typical joist size 2x10");
            result.reasoning.push("2x10 joists common for residential floor framing");
            result.confidenceBoost += 0.1;
          } else if (scope.includes("rafter")) {
            result.materialUpdates.spec = "2x8";
            result.assumptions.push("Applied typical rafter size 2x8");
            result.reasoning.push("2x8 rafters adequate for most residential roof spans");
            result.confidenceBoost += 0.1;
          }
          break;

        case "material.grade":
          result.materialUpdates.grade = "No.2";
          result.assumptions.push("Applied default structural grade No.2");
          result.reasoning.push("No.2 grade is standard for structural framing");
          result.confidenceBoost += 0.05;
          break;

        case "material.species":
          result.materialUpdates.species = "SPF";
          result.assumptions.push("Applied regional default species SPF");
          result.reasoning.push("SPF (Spruce-Pine-Fir) is widely available and cost-effective");
          result.confidenceBoost += 0.05;
          break;

        case "material.nailingPattern":
          if (scope.includes("sheathing")) {
            result.materialUpdates.edgeSpacing = "6\"";
            result.materialUpdates.fieldSpacing = "12\"";
            result.assumptions.push("Applied typical sheathing nailing pattern");
            result.reasoning.push("6\" edge, 12\" field spacing is standard residential code requirement");
            result.confidenceBoost += 0.1;
          }
          break;

        case "material.bearingLength":
          result.materialUpdates.bearingLength = 1.5;
          result.assumptions.push("Applied minimum header bearing length 1.5\"");
          result.reasoning.push("Minimum bearing length per building code requirements");
          result.confidenceBoost += 0.15;
          break;
      }
    });

    // Apply advanced construction logic
    if (scope.includes("corner") && !item.cornerStuds) {
      result.materialUpdates.cornerStuds = 3;
      result.assumptions.push("Applied 3-stud corner configuration");
      result.reasoning.push("3-stud corners provide proper nailing surface for intersecting walls");
      result.confidenceBoost += 0.1;
    }

    if (scope.includes("t-intersection") && !item.tIntersectionStuds) {
      result.materialUpdates.tIntersectionStuds = 2;
      result.assumptions.push("Applied 2-stud T-intersection configuration");
      result.reasoning.push("2-stud T-intersections provide adequate nailing surface");
      result.confidenceBoost += 0.1;
    }

    result.applied = Object.keys(result.materialUpdates).length > 0 || 
                    Object.keys(result.contextUpdates).length > 0;

    return result;
  }

  /**
   * Extract opening width from line item for header sizing
   */
  private extractOpeningWidthFromItem(item: TakeoffLineItem): number | null {
    // Try to extract from material size
    if (item.material.size) {
      const match = item.material.size.match(/(\d+)['"]?\s*(?:x|\*|×)/);
      if (match) return parseInt(match[1]);
    }

    // Try to extract from context or assumptions
    const widthAssumption = item.assumptions.find(a => 
      a.toLowerCase().includes("width") || a.toLowerCase().includes("span")
    );
    if (widthAssumption) {
      const match = widthAssumption.match(/(\d+)['"]?/);
      if (match) return parseInt(match[1]);
    }

    // Try to extract from scope description
    const scope = item.context.scope.toLowerCase();
    if (scope.includes("door")) return 36; // Standard door width
    if (scope.includes("window")) return 48; // Typical window width
    
    return null;
  }
}

export const enrichmentService = new EnrichmentService();