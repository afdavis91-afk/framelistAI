 import { PDFAnalysisService } from "./pdfAnalysisService";
 import { drawingUnderstandingService } from "./drawingUnderstandingService";
 import { materialValidationService } from "./materialValidationService";
 import { performanceOptimizationService } from "./performanceOptimizationService";
 import { enrichmentService } from "./enrichmentService";
 import { useConstructionStore } from "../state/constructionStore";
 import { useSettingsStore } from "../state/settingsStore";
 import { ProjectDocument, Takeoff, EnrichmentContext } from "../types/construction";
 import { runExpertDecisions } from "./enrichmentService/expert";
 import { inferLevelFromSheet, normalizeLevel } from "../utils/levels";
 import * as FileSystem from "expo-file-system";
 import * as Network from "expo-network";


interface ProcessingStep {
  id: string;
  name: string;
  description: string;
  weight: number; // Percentage of total progress
}

interface ProcessingError {
  step: string;
  error: Error;
  timestamp: Date;
  retryable: boolean;
}

interface ProcessingOptions {
  maxRetries?: number;
  retryDelay?: number;
  enableFallbacks?: boolean;
  skipGeometricAnalysis?: boolean;
  onStepStart?: (step: ProcessingStep) => void;
  onStepComplete?: (step: ProcessingStep, result: any) => void;
  onStepError?: (step: ProcessingStep, error: ProcessingError) => void;
}

export class DocumentProcessingService {
  private analysisService: PDFAnalysisService;
  private processingSteps: ProcessingStep[] = [
    {
      id: "validation",
      name: "Document Validation",
      description: "Validating document format and accessibility",
      weight: 5
    },
    {
      id: "pdf_analysis",
      name: "PDF Analysis",
      description: "Extracting text and analyzing document structure",
      weight: 30
    },
    {
      id: "baseline_reconciliation",
      name: "Baseline Reconciliation",
      description: "Identifying gaps and conflicts in baseline analysis",
      weight: 20
    },
    {
      id: "expert_gap_analysis",
      name: "Expert Gap Analysis",
      description: "Determining what materials and details are missing",
      weight: 15
    },
    {
      id: "drawing_analysis",
      name: "Drawing Analysis",
      description: "Analyzing drawings with expert context",
      weight: 20
    },
    {
      id: "advanced_reasoning",
      name: "Advanced Reasoning",
      description: "Filling gaps using expert construction knowledge",
      weight: 10
    },
    {
      id: "data_integration",
      name: "Data Integration",
      description: "Merging all analysis results",
      weight: 10
    },
    {
      id: "quality_validation",
      name: "Quality Validation",
      description: "Validating material capture completeness and specifications",
      weight: 10
    },
    {
      id: "expert_decisions",
      name: "Expert Decisions",
      description: "Applying final expert decisions and optimizations",
      weight: 5
    }
  ];


  constructor() {
    this.analysisService = new PDFAnalysisService({
      studSpacingDefault: 16,
      cornerStudCount: 3,
      tIntersectionStudCount: 2,
      headerBearing: 1.5,
      wasteFactors: {
        studsPct: 10,
        platesPct: 5,
        sheathingPct: 10,
        blockingPct: 15,
        fastenersPct: 5,
      },
    });
  }

  async processDocument(
    projectId: string,
    documentId: string,
    onProgress?: (progress: number) => void,
    options: ProcessingOptions = {}
  ): Promise<string> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      enableFallbacks = true,
      skipGeometricAnalysis = false,
      onStepStart,
      onStepComplete,
      onStepError
    } = options;

    const store = useConstructionStore.getState();
    const project = store.projects.find((p) => p.id === projectId);
    const document = project?.documents.find((d) => d.id === documentId);

    if (!project || !document) {
      throw new Error("Project or document not found");
    }

    // Connectivity check (friendly early error)
    try {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) {
        throw new Error("You appear to be offline. Please check your connection and try again.");
      }
    } catch {}

    const processingErrors: ProcessingError[] = [];
    let currentProgress = 0;

    const updateProgress = (stepProgress: number, stepWeight: number, stepIndex: number) => {
      const previousStepsWeight = this.processingSteps
        .slice(0, stepIndex)
        .reduce((sum, step) => sum + step.weight, 0);
      
      const totalProgress = previousStepsWeight + (stepProgress * stepWeight / 100);
      currentProgress = Math.min(100, totalProgress);
      onProgress?.(currentProgress);
      store.setProcessingStatus(true, currentProgress);
    };

    const executeStepWithRetry = async <T>(
      step: ProcessingStep,
      stepIndex: number,
      operation: () => Promise<T>,
      fallback?: () => T
    ): Promise<T> => {
      onStepStart?.(step);
      updateProgress(0, step.weight, stepIndex);

      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await operation();
          updateProgress(100, step.weight, stepIndex);
          onStepComplete?.(step, result);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          const processingError: ProcessingError = {
            step: step.id,
            error: lastError,
            timestamp: new Date(),
            retryable: attempt < maxRetries
          };
          
          processingErrors.push(processingError);
          onStepError?.(step, processingError);
          
          if (attempt < maxRetries) {
            const jitter = 0.7 + Math.random() * 0.7;
            await new Promise(resolve => setTimeout(resolve, Math.floor(retryDelay * attempt * jitter)));
          } else {
            if (enableFallbacks && fallback) {
              const fallbackResult = fallback();
              updateProgress(100, step.weight, stepIndex);
              onStepComplete?.(step, fallbackResult);
              return fallbackResult;
            }
            throw lastError;
          }
        }
      }
      
      throw lastError!;
    };

    try {
      store.updateDocument(documentId, { processingStatus: "processing" });
      store.setProcessingStatus(true, 0);
      this.analysisService = new PDFAnalysisService(store.constructionStandards);

      // Step 1: Document Validation
      await executeStepWithRetry(
        this.processingSteps[0],
        0,
        async () => {
          await this.validateDocument(document);
          return { valid: true };
        }
      );

      // Step 2: PDF Analysis (with caching)
      const fileInfo = await FileSystem.getInfoAsync(document.uri);
      const analysisCacheKey = performanceOptimizationService.generateCacheKey(
        document.uri, 
        { standards: store.constructionStandards, type: "pdf_analysis", size: (fileInfo as any)?.size, mtime: (fileInfo as any)?.modificationTime }
      );
      
      const analysisResult = await executeStepWithRetry(
        this.processingSteps[1],
        1,
        async () => {
          // Check cache first
          const cached = await performanceOptimizationService.getCachedResult(analysisCacheKey);
          if (cached) {
            return cached;
          }

          // Perform analysis
          const result = await this.analysisService.analyzePDF(
            document,
            store.constructionStandards.wasteFactors,
            (progress) => updateProgress(progress, this.processingSteps[1].weight, 1),
            project.documents
          );

          // Cache the result
          await performanceOptimizationService.setCachedResult(analysisCacheKey, result);
          return result;
        },
        enableFallbacks ? () => this.createBasicAnalysisResult(document) : undefined
      );

      // Step 3: Baseline Reconciliation
      const baselineReconciliationResult = await executeStepWithRetry(
        this.processingSteps[2],
        2,
        async () => {
          const enrichmentContext: EnrichmentContext = {
            projectDocuments: project.documents,
            baselineAnalysis: analysisResult,
            constructionStandards: store.constructionStandards,
          };

          // Run baseline reconciliation to identify gaps and conflicts
          return await enrichmentService.enrichAnalysis(
            analysisResult.lineItems,
            enrichmentContext,
            (progress: number) => updateProgress(progress, this.processingSteps[2].weight, 2)
          );
        },
        enableFallbacks ? () => ({ enrichedLineItems: analysisResult.lineItems, flags: [], confidence: 0 }) : undefined
      );

      // Step 4: Expert Gap Analysis
      const gapAnalysisResult = await executeStepWithRetry(
        this.processingSteps[3],
        3,
        async () => {
          const enrichmentContext: EnrichmentContext = {
            projectDocuments: project.documents,
            baselineAnalysis: analysisResult,
            constructionStandards: store.constructionStandards,
          };

          // Run expert gap analysis to determine what's missing
          return await enrichmentService.enrichAnalysis(
            baselineReconciliationResult.enrichedLineItems,
            enrichmentContext,
            (progress: number) => updateProgress(progress, this.processingSteps[3].weight, 3)
          );
        },
        enableFallbacks ? () => baselineReconciliationResult : undefined
      );

      // Step 5: Drawing Analysis with Expert Context
      let drawingAnalysis;
      if (!skipGeometricAnalysis) {
        drawingAnalysis = await executeStepWithRetry(
          this.processingSteps[4],
          4,
          async () => {
            const enrichmentContext: EnrichmentContext = {
              projectDocuments: project.documents,
              baselineAnalysis: analysisResult,
              constructionStandards: store.constructionStandards,
            };

            // Now run drawing analysis with expert context from gap analysis
            return await drawingUnderstandingService.analyzeDocument(
              document,
              enrichmentContext,
              (progress) => updateProgress(progress, this.processingSteps[4].weight, 4)
            );
          },
          enableFallbacks ? () => this.createMinimalDrawingAnalysis(document) : undefined
        );
      } else {
        drawingAnalysis = this.createMinimalDrawingAnalysis(document);
        updateProgress(100, this.processingSteps[4].weight, 4);
      }

      // Backfill/normalize levels on baseline items using drawing pages
      try {
        const sheetLevelMap = new Map<string, string>();
        for (const p of (drawingAnalysis?.pages || [])) {
          if (p?.sheetId) {
            sheetLevelMap.set(p.sheetId, inferLevelFromSheet(p.sheetId, p.title));
          }
        }
        for (const item of gapAnalysisResult.enrichedLineItems) {
          const current = String(item.context?.level || "UNKNOWN");
          const normalized = normalizeLevel(current);
          const sheet = item.context?.sheetRef || "";
          const inferred = sheet && sheetLevelMap.has(sheet) ? sheetLevelMap.get(sheet)! : normalizeLevel(sheet);
          if (normalized === "UNKNOWN" || (normalized === "GROUND FLOOR" && inferred !== "UNKNOWN" && inferred !== "GROUND FLOOR")) {
            (item as any).context.level = inferred;
          }
        }
      } catch {}

      // Step 6: Advanced Reasoning with Drawing Data
      const advancedReasoningResult = await executeStepWithRetry(
        this.processingSteps[5],
        5,
        async () => {
          const enrichmentContext: EnrichmentContext = {
            projectDocuments: project.documents,
            baselineAnalysis: analysisResult,
            constructionStandards: store.constructionStandards,
          };

          // Run advanced reasoning to fill gaps using expert knowledge and drawing data
          return await enrichmentService.enrichAnalysis(
            gapAnalysisResult.enrichedLineItems,
            enrichmentContext,
            (progress: number) => updateProgress(progress, this.processingSteps[5].weight, 5)
          );
        },
        enableFallbacks ? () => gapAnalysisResult : undefined
      );
 
       // Step 7: Data Integration
       const enrichedLineItems = await executeStepWithRetry(

        this.processingSteps[6],
        6,
        async () => {
          return this.mergeGeometricData(
            advancedReasoningResult.enrichedLineItems,
            drawingAnalysis,
            document
          );
        },
        enableFallbacks ? () => advancedReasoningResult.enrichedLineItems : undefined
      );

       // Assumptive Backfill (between integration and validation)
       let afterBackfillItems = enrichedLineItems;
         try {
          const { enableAssumptiveBackfill, enableStructuralOnlyEnhancements } = await import("../pipeline/featureFlags");
          if (enableAssumptiveBackfill() || enableStructuralOnlyEnhancements()) {
           const { backfillAssumptions } = await import("./enrichmentService/AssumptionBackfillModule");
            const backfill = await backfillAssumptions(enrichedLineItems, {
              wallTypes: analysisResult.wallTypes || [],
              joistSystems: analysisResult.joistSystems || [],
              roofFraming: analysisResult.roofFraming || [],
              sheathingSystems: analysisResult.sheathingSystems || [],
              standards: store.constructionStandards,
              drawingAnalysis,
              documents: project.documents,
            });
           if (Array.isArray(backfill.assumedItems) && backfill.assumedItems.length > 0) {
             afterBackfillItems = [...enrichedLineItems, ...backfill.assumedItems];
             (analysisResult as any)._assumptionBackfillFlags = [
               {
                 type: "ASSUMPTION" as any,
                 message: `Assumptive backfill added ${backfill.assumedItems.length} items across missing categories`,
                 severity: "low",
                 sheets: [],
                 resolved: false,
               },
               ...backfill.flags,
             ];
           }
         }
       } catch {}

       // Step 8: Quality Validation
       const { validationFlags, adjustedLineItems } = await executeStepWithRetry(
         this.processingSteps[7],
         7,
         async () => {
           // Run material validation
            const validationReports = await materialValidationService.validateMaterials(
              afterBackfillItems,
              (progress) => updateProgress(progress * 0.7, this.processingSteps[7].weight, 7)
            );

           // Apply confidence adjustments
            const adjustedItems = afterBackfillItems.map((item: any) => {
             const report = validationReports.find(r => r.itemId === item.itemId);
             if (report) {
               return {
                 ...item,
                 confidence: report.adjustedConfidence,
                 assumptions: [
                   ...item.assumptions,
                   ...report.validationResults
                     .filter((vr: any) => !vr.result.passed && vr.result.suggestion)
                     .map((vr: any) => `Validation: ${vr.result.suggestion}`)
                 ]
               };
             }
             return item;
           });

           // Collect validation flags
           const allValidationFlags = validationReports.flatMap((r: any) => r.flags);
           
           // Run legacy validation
           updateProgress(70, this.processingSteps[7].weight, 7);
           const legacyFlags = this.validateMaterialCapture(adjustedItems, drawingAnalysis);
           
           return {
             validationFlags: [...allValidationFlags, ...legacyFlags],
             adjustedLineItems: adjustedItems
           };
         },
          enableFallbacks ? () => ({ validationFlags: [], adjustedLineItems: afterBackfillItems }) : undefined
       );

       // Step 9: Expert Decisions (optional)
       const settings = useSettingsStore.getState();
        let finalLineItems = adjustedLineItems;
        let decisionFlags: any[] = [];
        let decisionRecords: any[] = [];
        let coverageFlags: any[] = [];
        let confidenceBump = 0;


       if (settings.enableAutoDecisions) {
         const expertResult = await executeStepWithRetry(
           this.processingSteps[8],
           8,
           async () => {
             const ctx: EnrichmentContext = {
               projectDocuments: project.documents,
               baselineAnalysis: analysisResult,
               constructionStandards: store.constructionStandards,
             };
             return await runExpertDecisions(adjustedLineItems, ctx, settings.decisionMinConfidence);
           },
           enableFallbacks ? () => ({ updatedItems: adjustedLineItems, decisions: [], flags: [], confidenceDelta: 0 }) : undefined
         );

         finalLineItems = expertResult.updatedItems;
         decisionFlags = expertResult.flags;
         decisionRecords = expertResult.decisions;
         confidenceBump = expertResult.confidenceDelta || 0;
        } else {
          // If disabled, mark step complete without changes
          updateProgress(100, this.processingSteps[8].weight, 8);
        }

        // Coverage flag: detect missing levels
        try {
          const pageLevels = new Set<string>();
          for (const p of (drawingAnalysis?.pages || [])) {
            const lvl = inferLevelFromSheet(p?.sheetId, p?.title);
            if (lvl !== "UNKNOWN") pageLevels.add(lvl);
          }
          const itemLevels = new Set<string>();
          for (const it of finalLineItems) {
            const nl = normalizeLevel(it.context?.level);
            if (nl !== "UNKNOWN") itemLevels.add(nl);
          }
          const missing: string[] = [];
          pageLevels.forEach((lvl) => { if (!itemLevels.has(lvl)) missing.push(lvl); });
          if (missing.length > 0) {
            coverageFlags.push({
              type: "MISSING_INFO",
              message: `Detected ${missing.join(", ")} plans but found no items for those levels`,
              severity: "high",
              sheets: [],
              resolved: false,
            });
          }
        } catch {}
 
        // Create takeoff with processing metadata
        const baseConfidence = this.calculateProcessingConfidence(

         analysisResult.confidence, 
         drawingAnalysis?.confidence || 0, 
         processingErrors
       );

       const takeoff: Omit<Takeoff, "id" | "createdAt" | "updatedAt"> = {
         project: analysisResult.projectInfo,
         wallTypes: [],
         lineItems: finalLineItems,
         connectorSchedules: analysisResult.connectorSchedules || [],
         fastenerSchedules: analysisResult.fastenerSchedules || [],
         joistSystems: analysisResult.joistSystems || [],
         roofFraming: analysisResult.roofFraming || [],
         sheathingSystems: analysisResult.sheathingSystems || [],
          flags: [
            ...analysisResult.flags,
            ...((analysisResult as any)._assumptionBackfillFlags || []),
            ...(drawingAnalysis?.flags || []),
            ...validationFlags,
            ...decisionFlags,
            ...coverageFlags,
            ...this.createProcessingFlags(processingErrors),
           {
             type: "PROCESSING_COMPLETE" as any,
             message: `Document processing completed ${processingErrors.length > 0 ? "with warnings" : "successfully"}`,
             severity: processingErrors.length > 0 ? "medium" : "low",
             sheets: [],
             resolved: true,
           } as any
         ],
         confidence: Math.min(1, Math.max(0, baseConfidence + (confidenceBump || 0) + ((Number.isFinite(advancedReasoningResult?.confidence) ? advancedReasoningResult.confidence : 0) * 0.1))),
         decisions: decisionRecords,
       };


      const takeoffId = store.addTakeoff(projectId, takeoff);

      // Update project metadata if available
      if (analysisResult.projectInfo.name !== "Unknown Project") {
        store.updateProject(projectId, {
          name: analysisResult.projectInfo.name,
          address: analysisResult.projectInfo.address,
        });
      }

      store.updateDocument(documentId, { 
        processed: true, 
        processingStatus: "completed"
      });

      store.setProcessingStatus(false, 0);
      onProgress?.(100);

      return takeoffId;
    } catch (error) {
      const detailedError = this.createDetailedErrorMessage(error, processingErrors);
      
      store.updateDocument(documentId, { 
        processingStatus: "failed",
        processed: false 
      });
      store.setProcessingStatus(false, 0);
      
      throw new Error(detailedError);
    }
  }

  /**
   * Validate document before processing
   */
  private async validateDocument(document: ProjectDocument): Promise<void> {
    // Check file exists and is accessible
    try {
      const fileInfo = await FileSystem.getInfoAsync(document.uri);
      if (!fileInfo.exists) {
        throw new Error("Document file not found");
      }
      
      if (fileInfo.size === 0) {
        throw new Error("Document file is empty");
      }
      
      if (fileInfo.size > 100 * 1024 * 1024) { // 100MB limit
        throw new Error("Document file is too large (max 100MB)");
      }
    } catch (error) {
      throw new Error(`Document validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Validate PDF format
    if (!document.name.toLowerCase().endsWith('.pdf')) {
      throw new Error("Only PDF documents are supported");
    }
  }

  /**
   * Calculate processing confidence based on results and errors
   */
  private calculateProcessingConfidence(
    analysisConfidence: number,
    geometricConfidence: number,
    errors: ProcessingError[]
  ): number {
    let baseConfidence = Math.max(analysisConfidence, geometricConfidence);
    
    // Reduce confidence based on errors
    const errorPenalty = errors.length * 0.1;
    const criticalErrors = errors.filter(e => !e.retryable).length;
    const criticalPenalty = criticalErrors * 0.2;
    
    return Math.max(0.1, baseConfidence - errorPenalty - criticalPenalty);
  }

  /**
   * Create processing flags from errors
   */
  private createProcessingFlags(errors: ProcessingError[]): any[] {
    return errors.map(error => ({
      type: "PROCESSING_WARNING" as any,
      message: `Step ${error.step} encountered issues: ${error.error.message}`,
      severity: error.retryable ? "medium" : "high",
      sheets: [],
      resolved: false,
    }));
  }

  /**
   * Create detailed error message
   */
  private createDetailedErrorMessage(mainError: unknown, processingErrors: ProcessingError[]): string {
    const mainMessage = mainError instanceof Error ? mainError.message : "Unknown error occurred";
    
    if (processingErrors.length === 0) {
      return `Document processing failed: ${mainMessage}`;
    }
    
    const errorSummary = processingErrors
      .map(e => `${e.step}: ${e.error.message}`)
      .join("; ");
    
    return `Document processing failed: ${mainMessage}. Step errors: ${errorSummary}`;
  }

  /**
   * Process multiple documents with coordinated progress tracking
   */
  async processMultipleDocuments(
    projectId: string,
    documentIds: string[],
    onProgress?: (progress: number) => void,
    options: ProcessingOptions = {}
  ): Promise<string[]> {
    const store = useConstructionStore.getState();
    const project = store.projects.find((p) => p.id === projectId);
    
    if (!project) {
      throw new Error("Project not found");
    }

    const documents = documentIds
      .map(id => project.documents.find(d => d.id === id))
      .filter((doc): doc is ProjectDocument => doc !== undefined);

    if (documents.length === 0) {
      throw new Error("No valid documents found");
    }

    const takeoffIds: string[] = [];
    const processingResults: Array<{ success: boolean; takeoffId?: string; error?: string }> = [];
    
    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      const documentProgress = (i / documents.length) * 100;
      
      try {
        const takeoffId = await this.processDocument(
          projectId,
          document.id,
          (docProgress) => {
            const totalProgress = documentProgress + (docProgress / documents.length);
            onProgress?.(Math.min(100, totalProgress));
          },
          {
            ...options,
            onStepStart: (step) => {
              console.log(`[MultiDoc] Processing ${document.name} - ${step.name}`);
              options.onStepStart?.(step);
            }
          }
        );
        
        takeoffIds.push(takeoffId);
        processingResults.push({ success: true, takeoffId });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[MultiDoc] Failed to process ${document.name}:`, error);
        processingResults.push({ success: false, error: errorMessage });
      }
    }

    onProgress?.(100);

    // Create summary takeoff if multiple documents were processed successfully
    if (takeoffIds.length > 1) {
      try {
        const summaryTakeoffId = await this.createSummaryTakeoff(projectId, takeoffIds);
        takeoffIds.push(summaryTakeoffId);
      } catch (error) {
        console.warn("[MultiDoc] Failed to create summary takeoff:", error);
      }
    }

    // Report results
    const successCount = processingResults.filter(r => r.success).length;
    const failureCount = processingResults.length - successCount;
    
    if (failureCount > 0) {
      const failureMessages = processingResults
        .filter(r => !r.success)
        .map(r => r.error)
        .join("; ");
      
      if (successCount === 0) {
        throw new Error(`All documents failed to process: ${failureMessages}`);
      } else {
        console.warn(`[MultiDoc] ${failureCount} documents failed: ${failureMessages}`);
      }
    }

    return takeoffIds;
  }

  /**
   * Create a summary takeoff combining multiple document analyses
   */
  private async createSummaryTakeoff(projectId: string, takeoffIds: string[]): Promise<string> {
    const store = useConstructionStore.getState();
    const project = store.projects.find(p => p.id === projectId);
    
    if (!project) {
      throw new Error("Project not found");
    }

    const takeoffs = takeoffIds
      .map(id => project.takeoffs.find(t => t.id === id))
      .filter((t): t is Takeoff => t !== undefined);

    if (takeoffs.length < 2) {
      throw new Error("Need at least 2 takeoffs to create summary");
    }

    // Combine line items from all takeoffs
    const allLineItems = takeoffs.flatMap(t => t.lineItems);
    const allFlags = takeoffs.flatMap(t => t.flags);
    
    // Calculate combined confidence
    const avgConfidence = takeoffs.reduce((sum, t) => sum + t.confidence, 0) / takeoffs.length;

    const summaryTakeoff: Omit<Takeoff, "id" | "createdAt" | "updatedAt"> = {
      project: takeoffs[0].project,
      wallTypes: [],
      lineItems: allLineItems,
      connectorSchedules: [],
      fastenerSchedules: [],
      joistSystems: [],
      roofFraming: [],
      sheathingSystems: [],
      flags: [
        ...allFlags,
        {
          type: "ASSUMPTION",
          message: `Combined analysis from ${takeoffs.length} documents`,
          severity: "low",
          sheets: [],
          resolved: true,
        }
      ],
      confidence: avgConfidence,
    };

    return store.addTakeoff(projectId, summaryTakeoff);
  }

  /**
   * Create basic analysis result when enhanced analysis fails
   */
  private createBasicAnalysisResult(document: ProjectDocument): any {
    return {
      lineItems: [],
      flags: [{
        type: "BASIC_ANALYSIS_ONLY",
        message: "Enhanced PDF analysis failed, using basic processing",
        severity: "medium",
        resolved: false,
      }],
      confidence: 0.3,
      projectInfo: {
        name: "Unknown Project",
        address: "Unknown",
        levels: ["Unknown"],
      },
    };
  }

  /**
   * Create minimal drawing analysis when enhanced analysis fails
   */
  private createMinimalDrawingAnalysis(document: ProjectDocument): any {
    return {
      documentId: document.id,
      pages: [{
        id: `page_1_${document.id}`,
        documentId: document.id,
        pageNumber: 1,
        sheetId: "A1.01",
        title: "Construction Drawing",
        discipline: "architectural",
        classification: "plan",
        tiles: [],
        entities: [],
        confidence: 0.3,
        processedAt: new Date(),
      }],
      globalEntities: [],
      confidence: 0.3,
      flags: [{
        type: "BASIC_GEOMETRIC_ANALYSIS",
        message: "Enhanced geometric analysis failed, using basic processing",
        severity: "medium",
        resolved: false,
      }],
      processedAt: new Date(),
      processingTime: 0,
    };
  }

  /**
   * Merge geometric entity data with material takeoff line items
   */
  private mergeGeometricData(
    lineItems: any[],
    drawingAnalysis: any,
    document: ProjectDocument
  ): any[] {
    const enrichedItems = [...lineItems];

    // Extract wall types and specifications from drawing analysis
    const wallTypes = this.extractWallTypes(drawingAnalysis);
    const materialSpecs = this.extractMaterialSpecifications(drawingAnalysis);

    // Enhance existing line items with geometric data
    for (const item of enrichedItems) {
      // Find matching wall type
      const wallType = this.findMatchingWallType(item, wallTypes);
      if (wallType) {
        item.context.wallType = wallType.id;
        item.material = { ...item.material, ...wallType.materialSpecs };
      }

      // Find matching material specifications
      const materialSpec = this.findMatchingMaterialSpec(item, materialSpecs);
      if (materialSpec) {
        item.material = { ...item.material, ...materialSpec };
      }

      // Add geometric evidence references
      const geometricEvidence = this.findGeometricEvidence(item, drawingAnalysis);
      if (geometricEvidence.length > 0) {
        item.evidenceRefs = [...(item.evidenceRefs || []), ...geometricEvidence];
      }
    }

    // Add new line items for geometric entities not covered by basic analysis
    const newItems = this.createLineItemsFromGeometricEntities(drawingAnalysis, document);
    enrichedItems.push(...newItems);

    return enrichedItems;
  }

  /**
   * Extract wall types from drawing analysis
   */
  private extractWallTypes(drawingAnalysis: any): any[] {
    const wallTypes: any[] = [];

    // Extract from global entities
    for (const entity of drawingAnalysis.globalEntities || []) {
      if (entity.type === "wall_type") {
        wallTypes.push({
          id: entity.id,
          materialSpecs: entity.properties,
          location: entity.location,
        });
      }
    }

    // Extract from page entities
    for (const page of drawingAnalysis.pages || []) {
      for (const entity of page.entities || []) {
        if (entity.type === "wall_type") {
          wallTypes.push({
            id: entity.id,
            materialSpecs: entity.properties,
            location: entity.location,
          });
        }
      }
    }

    return wallTypes;
  }

  /**
   * Extract material specifications from drawing analysis
   */
  private extractMaterialSpecifications(drawingAnalysis: any): any[] {
    const materialSpecs: any[] = [];

    // Extract from global entities
    for (const entity of drawingAnalysis.globalEntities || []) {
      if (entity.type === "material") {
        materialSpecs.push({
          id: entity.id,
          ...entity.properties,
          location: entity.location,
        });
      }
    }

    // Extract from page entities
    for (const page of drawingAnalysis.pages || []) {
      for (const entity of page.entities || []) {
        if (entity.type === "material") {
          materialSpecs.push({
            id: entity.id,
            ...entity.properties,
            location: entity.location,
          });
        }
      }
    }

    return materialSpecs;
  }

  /**
   * Find matching wall type for a line item
   */
  private findMatchingWallType(item: any, wallTypes: any[]): any | null {
    // Match based on material spec, location, or context
    for (const wallType of wallTypes) {
      if (this.matchesWallType(item, wallType)) {
        return wallType;
      }
    }
    return null;
  }

  /**
   * Check if a line item matches a wall type
   */
  private matchesWallType(item: any, wallType: any): boolean {
    // Match based on material specifications
    if (item.material?.spec && wallType.materialSpecs?.studSize) {
      return item.material.spec.includes(wallType.materialSpecs.studSize);
    }

    // Match based on location
    if (item.context?.level && wallType.location?.level) {
      return item.context.level === wallType.location.level;
    }

    return false;
  }

  /**
   * Find matching material specification for a line item
   */
  private findMatchingMaterialSpec(item: any, materialSpecs: any[]): any | null {
    for (const spec of materialSpecs) {
      if (this.matchesMaterialSpec(item, spec)) {
        return spec;
      }
    }
    return null;
  }

  /**
   * Check if a line item matches a material specification
   */
  private matchesMaterialSpec(item: any, spec: any): boolean {
    // Match based on material type
    if (item.material?.spec && spec.material) {
      return item.material.spec.toLowerCase().includes(spec.material.toLowerCase());
    }

    // Match based on size
    if (item.material?.size && spec.size) {
      return item.material.size === spec.size;
    }

    return false;
  }

  /**
   * Find geometric evidence for a line item
   */
  private findGeometricEvidence(item: any, drawingAnalysis: any): any[] {
    const evidence: any[] = [];

    // Search through all pages and entities
    for (const page of drawingAnalysis.pages || []) {
      for (const entity of page.entities || []) {
        if (this.entitySupportsLineItem(entity, item)) {
          evidence.push({
            documentId: drawingAnalysis.documentId,
            pageNumber: page.pageNumber,
            coordinates: entity.evidenceBox,
            description: `Geometric entity: ${entity.type} - ${entity.properties?.description || ''}`,
          });
        }
      }
    }

    return evidence;
  }

  /**
   * Check if a geometric entity supports a line item
   */
  private entitySupportsLineItem(entity: any, item: any): boolean {
    // Check if entity type matches item type
    if (entity.type === "wall" && item.itemId.toLowerCase().includes("stud")) {
      return true;
    }
    if (entity.type === "opening" && item.itemId.toLowerCase().includes("header")) {
      return true;
    }
    if (entity.type === "sheathing" && item.itemId.toLowerCase().includes("sheathing")) {
      return true;
    }

    return false;
  }

  /**
   * Create new line items from geometric entities
   */
  private createLineItemsFromGeometricEntities(drawingAnalysis: any, document: ProjectDocument): any[] {
    const newItems: any[] = [];

    // Process each page for new entities
    for (const page of drawingAnalysis.pages || []) {
      for (const entity of page.entities || []) {
        const lineItem = this.convertEntityToLineItem(entity, document, page);
        if (lineItem) {
          newItems.push(lineItem);
        }
      }
    }

    return newItems;
  }

  /**
   * Convert a geometric entity to a takeoff line item
   */
  private convertEntityToLineItem(entity: any, document: ProjectDocument, page: any): any | null {
    // Convert walls to stud/plate items
    if (entity.type === "wall") {
      return this.createWallLineItem(entity, document, page);
    }

    // Convert openings to header items
    if (entity.type === "opening") {
      return this.createOpeningLineItem(entity, document, page);
    }

    // Convert sheathing to sheathing items
    if (entity.type === "sheathing") {
      return this.createSheathingLineItem(entity, document, page);
    }

    // Convert connectors to connector items
    if (entity.type === "connector") {
      return this.createConnectorLineItem(entity, document, page);
    }

    // Convert fasteners to fastener items
    if (entity.type === "fastener") {
      return this.createFastenerLineItem(entity, document, page);
    }

    // Convert joists to joist items
    if (entity.type === "joist") {
      return this.createJoistLineItem(entity, document, page);
    }

    // Convert rafters to rafter items
    if (entity.type === "rafter") {
      return this.createRafterLineItem(entity, document, page);
    }

    // Convert beams to beam items
    if (entity.type === "beam" || entity.type === "header") {
      return this.createBeamLineItem(entity, document, page);
    }

    // Convert blocking to blocking items
    if (entity.type === "blocking") {
      return this.createBlockingLineItem(entity, document, page);
    }

    // Convert hangers to hanger items
    if (entity.type === "hanger") {
      return this.createHangerLineItem(entity, document, page);
    }

    // Convert plates to plate items
    if (entity.type === "plate" || entity.type === "cap_plate" || entity.type === "sole_plate") {
      return this.createPlateLineItem(entity, document, page);
    }

    // Convert studs to stud items
    if (entity.type === "stud") {
      return this.createStudLineItem(entity, document, page);
    }

    return null;
  }

  /**
   * Create a wall line item from a wall entity
   */
  private createWallLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.studSize || 'STUD'}`,
      uom: "EA",
      qty: this.calculateStudCount(props.length, props.studSpacing),
      material: {
        spec: props.studSize || "2x4",
        grade: props.grade || "No.2",
        species: props.species || "SPF",
        treatment: props.treatment || "",
        thickness: props.thickness || 0,
        width: props.width || 0,
        height: props.height || 0,
        length: props.length || 0,
      },
      context: {
        scope: props.wallType || "wall",
        wallType: entity.id,
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Stud spacing: ${props.studSpacing || 16}" o.c.`,
        `Wall height: ${props.height || 8}'`,
        `Corner studs: ${props.cornerStudCount || 3}`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Wall entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "stud_count",
        description: "Stud count = ceil(length / spacing) + corner studs",
        formula: `ceil(${props.length || 0} / ${props.studSpacing || 16}) + ${props.cornerStudCount || 3}`,
        assumptions: ["Standard stud spacing", "Corner stud count from typical details"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create an opening line item from an opening entity
   */
  private createOpeningLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.openingType || 'OPENING'}`,
      uom: "EA",
      qty: 1,
      material: {
        spec: props.headerSize || "2x8",
        grade: props.grade || "No.2",
        species: props.species || "SPF",
        treatment: props.treatment || "",
        thickness: props.thickness || 0,
        width: props.width || 0,
        height: props.height || 0,
        length: props.roughOpening || 0,
        plyCount: props.headerPlyCount || 2,
      },
      context: {
        scope: "opening",
        wallType: "",
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Header size: ${props.headerSize || "2x8"}`,
        `Ply count: ${props.headerPlyCount || 2}`,
        `Rough opening: ${props.roughOpening || 0}"`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Opening entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "opening_count",
        description: "Count of openings requiring headers",
        formula: "1",
        assumptions: ["Each opening requires one header"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create a sheathing line item from a sheathing entity
   */
  private createSheathingLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.material || 'SHEATHING'}`,
      uom: "SF",
      qty: this.calculateSheathingArea(props.length, props.height, props.openings),
      material: {
        spec: props.material || "plywood",
        grade: props.grade || "STRUCT 1",
        thickness: props.thickness || 0.5,
        width: props.width || 0,
        height: props.height || 0,
        length: props.length || 0,
        sheathingGrade: props.grade || "STRUCT 1",
        edgeSpacing: props.edgeSpacing || "6\"",
        fieldSpacing: props.fieldSpacing || "12\"",
      },
      context: {
        scope: "sheathing",
        wallType: "",
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Material: ${props.material || "plywood"}`,
        `Thickness: ${props.thickness || 0.5}"`,
        `Grade: ${props.grade || "STRUCT 1"}`,
        `Nailing: ${props.edgeSpacing || "6"}" edge, ${props.fieldSpacing || "12"}" field`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Sheathing entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "sheathing_area",
        description: "Sheathing area = wall area - openings",
        formula: `${props.length || 0} × ${props.height || 0} - ${props.openings || 0}`,
        assumptions: ["Openings > 4 SF subtracted", "Standard sheet sizes"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create a connector line item from a connector entity
   */
  private createConnectorLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.connectorType || 'CONNECTOR'}`,
      uom: "EA",
      qty: props.quantity || 1,
      material: {
        spec: props.connectorType || "connector",
        grade: props.grade || "",
        species: props.material || "steel",
        treatment: props.treatment || "",
        thickness: props.thickness || 0,
        width: props.width || 0,
        height: props.height || 0,
        length: props.length || 0,
        connectorType: props.connectorType || "connector",
      },
      context: {
        scope: "connector",
        wallType: "",
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Type: ${props.connectorType || "connector"}`,
        `Size: ${props.size || "standard"}`,
        `Material: ${props.material || "steel"}`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Connector entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "connector_count",
        description: "Count of connectors required",
        formula: `${props.quantity || 1}`,
        assumptions: ["Quantity from schedule or detail"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create a fastener line item from a fastener entity
   */
  private createFastenerLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.fastenerType || 'FASTENER'}`,
      uom: "EA",
      qty: props.quantity || 0,
      material: {
        spec: props.fastenerType || "nail",
        grade: props.grade || "",
        species: props.material || "steel",
        treatment: props.treatment || "",
        thickness: props.thickness || 0,
        width: props.width || 0,
        height: props.height || 0,
        length: props.length || 0,
        fastenerType: props.fastenerType || "nail",
        fastenerSize: props.size || "",
      },
      context: {
        scope: "fastener",
        wallType: "",
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Type: ${props.fastenerType || "nail"}`,
        `Size: ${props.size || "standard"}`,
        `Spacing: ${props.spacing || "standard"}`,
        `Galvanized: ${props.galvanized || false}`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Fastener entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "fastener_count",
        description: "Count of fasteners required",
        formula: `${props.quantity || 0}`,
        assumptions: ["Quantity from nailing schedule"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Calculate stud count based on wall length and spacing
   */
  private calculateStudCount(length: number, spacing: number): number {
    if (!length || !spacing) return 0;
    return Math.ceil(length / spacing) + 2; // +2 for end studs
  }

  /**
   * Calculate sheathing area with opening subtractions
   */
  private calculateSheathingArea(length: number, height: number, openings: number): number {
    if (!length || !height) return 0;
    const totalArea = length * height;
    return totalArea - (openings || 0);
  }

  /**
   * Create a joist line item from a joist entity
   */
  private createJoistLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.joistType || 'FLOOR'}_${props.size || '2X10'}`,
      uom: "EA",
      qty: this.calculateJoistCount(props.span, props.spacing),
      material: {
        spec: props.size || "2x10",
        grade: props.grade || "No.2",
        species: props.species || "SPF",
        treatment: props.treatment || "",
        thickness: this.parseSize(props.size)?.thickness || 0,
        width: this.parseSize(props.size)?.width || 0,
        length: props.span || 0,
        joistType: props.joistType || "floor",
        joistSpacing: props.spacing || 16,
        joistSpan: props.span || 0,
        engineeredType: props.engineeredType || "solid_sawn",
        hangerType: props.hangerType || "",
        hangerSize: props.hangerSize || "",
        blockingSpacing: props.blockingSpacing || 48,
        bridgingType: props.bridgingType || "solid",
        bridgingSpacing: props.bridgingSpacing || 96,
        bearingLength: props.bearingLength || 1.5,
        liveLoad: props.liveLoad || 40,
        deadLoad: props.deadLoad || 10,
      },
      context: {
        scope: "joist",
        wallType: "",
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Joist type: ${props.joistType || "floor"}`,
        `Spacing: ${props.spacing || 16}" o.c.`,
        `Span: ${props.span || 0}'`,
        `Bearing length: ${props.bearingLength || 1.5}"`,
        `Live load: ${props.liveLoad || 40} psf`,
        `Dead load: ${props.deadLoad || 10} psf`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Joist entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "joist_count",
        description: "Joist count = ceil(span / spacing) + 1",
        formula: `ceil(${props.span || 0} / ${props.spacing || 16}) + 1`,
        assumptions: ["Standard joist spacing", "End joists included"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create a rafter line item from a rafter entity
   */
  private createRafterLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.rafterType || 'COMMON'}_${props.size || '2X8'}`,
      uom: "EA",
      qty: this.calculateRafterCount(props.span, props.spacing, props.pitch),
      material: {
        spec: props.size || "2x8",
        grade: props.grade || "No.2",
        species: props.species || "SPF",
        treatment: props.treatment || "",
        thickness: this.parseSize(props.size)?.thickness || 0,
        width: this.parseSize(props.size)?.width || 0,
        length: this.calculateRafterLength(props.span, props.pitch, props.overhang),
        rafterType: props.rafterType || "common",
        rafterSpacing: props.spacing || 16,
        rafterSpan: props.span || 0,
        pitch: props.pitch || 6,
        overhang: props.overhang || 12,
        ridgeBoard: props.ridgeBoard || "2x10",
        collarTies: props.collarTies || "",
        rafterTies: props.rafterTies || "",
        birdsCut: props.birdsCut || true,
        plumbCut: props.plumbCut || true,
        bearingLength: props.bearingLength || 1.5,
        snowLoad: props.snowLoad || 30,
        windLoad: props.windLoad || 20,
      },
      context: {
        scope: "rafter",
        wallType: "",
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Rafter type: ${props.rafterType || "common"}`,
        `Spacing: ${props.spacing || 16}" o.c.`,
        `Span: ${props.span || 0}'`,
        `Pitch: ${props.pitch || 6}/12`,
        `Overhang: ${props.overhang || 12}"`,
        `Snow load: ${props.snowLoad || 30} psf`,
        `Wind load: ${props.windLoad || 20} psf`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Rafter entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "rafter_count",
        description: "Rafter count = ceil(span / spacing) + 1",
        formula: `ceil(${props.span || 0} / ${props.spacing || 16}) + 1`,
        assumptions: ["Standard rafter spacing", "Ridge and eave rafters included"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create a beam line item from a beam entity
   */
  private createBeamLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.beamType || 'HEADER'}_${props.size || '2X12'}`,
      uom: "EA",
      qty: 1,
      material: {
        spec: props.size || "2x12",
        grade: props.grade || "No.2",
        species: props.species || "SPF",
        treatment: props.treatment || "",
        thickness: this.parseSize(props.size)?.thickness || 0,
        width: this.parseSize(props.size)?.width || 0,
        length: props.span || 0,
        plyCount: props.plyCount || 2,
        beamType: props.beamType || "header",
        beamSpan: props.span || 0,
        engineeredType: props.engineeredType || "solid_sawn",
        bearingLength: props.bearingLength || 3,
        connectionType: props.connectionType || "bearing",
        hangerType: props.hangerType || "",
        hangerSize: props.hangerSize || "",
        designLoad: props.designLoad || 1000,
        deflectionLimit: props.deflectionLimit || "L/360",
      },
      context: {
        scope: "beam",
        wallType: "",
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Beam type: ${props.beamType || "header"}`,
        `Span: ${props.span || 0}'`,
        `Ply count: ${props.plyCount || 2}`,
        `Bearing length: ${props.bearingLength || 3}"`,
        `Design load: ${props.designLoad || 1000} lbs`,
        `Deflection limit: ${props.deflectionLimit || "L/360"}`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Beam entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "beam_count",
        description: "Count of beams required",
        formula: "1",
        assumptions: ["Single beam per opening or span"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create a blocking line item from a blocking entity
   */
  private createBlockingLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.blockingType || 'SOLID'}_${props.size || '2X10'}`,
      uom: "LF",
      qty: this.calculateBlockingLength(props.spacing, props.joistCount),
      material: {
        spec: props.size || "2x10",
        grade: props.grade || "No.2",
        species: props.species || "SPF",
        treatment: props.treatment || "",
        thickness: this.parseSize(props.size)?.thickness || 0,
        width: this.parseSize(props.size)?.width || 0,
        length: props.length || 14.5,
        blockingPurpose: props.purpose || "structural",
        fireRating: props.fireRating || "",
        fastenerType: props.fastenerType || "16d common",
        fastenerSize: props.fastenerSize || "3.5\"",
      },
      context: {
        scope: "blocking",
        wallType: "",
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Blocking type: ${props.blockingType || "solid"}`,
        `Purpose: ${props.purpose || "structural"}`,
        `Spacing: ${props.spacing || 48}" o.c.`,
        `Installation: ${props.installationMethod || "between_joists"}`,
        `Fastener: ${props.fastenerType || "16d common"}`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Blocking entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "blocking_length",
        description: "Blocking length = joist count × joist depth",
        formula: `${props.joistCount || 0} × ${props.length || 14.5}`,
        assumptions: ["Solid blocking between joists", "Standard joist depth"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create a hanger line item from a hanger entity
   */
  private createHangerLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.hangerType || 'JOIST'}_${props.size || '2X10'}`,
      uom: "EA",
      qty: props.quantity || 1,
      material: {
        spec: props.hangerType || "joist_hanger",
        grade: props.material || "galvanized_steel",
        size: props.size || "2x10",
        hangerType: props.hangerType || "joist_hanger",
        hangerSize: props.size || "2x10",
        hangerMaterial: props.material || "galvanized_steel",
        hangerLoadRating: props.loadRating || 1500,
        fastenerType: props.fastenerType || "joist_hanger_nail",
        manufacturer: props.manufacturer || "",
        model: props.model || "",
        seismicRated: props.seismicRated || false,
        windRated: props.windRated || false,
      },
      context: {
        scope: "hanger",
        wallType: "",
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Hanger type: ${props.hangerType || "joist_hanger"}`,
        `Member size: ${props.size || "2x10"}`,
        `Load rating: ${props.loadRating || 1500} lbs`,
        `Material: ${props.material || "galvanized_steel"}`,
        `Fastener: ${props.fastenerType || "joist_hanger_nail"}`,
        `Quantity: ${props.quantity || 1}`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Hanger entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "hanger_count",
        description: "Count of hangers required",
        formula: `${props.quantity || 1}`,
        assumptions: ["One hanger per connection point"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create a plate line item from a plate entity
   */
  private createPlateLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.plateType || 'TOP'}_${props.size || '2X4'}`,
      uom: "LF",
      qty: props.length || 0,
      material: {
        spec: props.size || "2x4",
        grade: props.grade || "No.2",
        species: props.species || "SPF",
        treatment: props.treatment || "",
        thickness: this.parseSize(props.size)?.thickness || 0,
        width: this.parseSize(props.size)?.width || 0,
        length: props.stockLength || 16,
      },
      context: {
        scope: "plate",
        wallType: entity.id,
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Plate type: ${props.plateType || "top"}`,
        `Wall length: ${props.length || 0}'`,
        `Stock length: ${props.stockLength || 16}'`,
        `Splice allowance: 10%`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Plate entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "plate_length",
        description: "Plate length = wall length + splice allowance",
        formula: `${props.length || 0} × 1.1`,
        assumptions: ["10% splice allowance", "Standard stock lengths"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Create a stud line item from a stud entity
   */
  private createStudLineItem(entity: any, document: ProjectDocument, page: any): any {
    const props = entity.properties || {};
    
    return {
      itemId: `${entity.type.toUpperCase()}_${props.studType || 'COMMON'}_${props.size || '2X4'}`,
      uom: "EA",
      qty: this.calculateStudCount(props.wallLength, props.spacing),
      material: {
        spec: props.size || "2x4",
        grade: props.grade || "No.2",
        species: props.species || "SPF",
        treatment: props.treatment || "",
        thickness: this.parseSize(props.size)?.thickness || 0,
        width: this.parseSize(props.size)?.width || 0,
        length: props.height || 8,
      },
      context: {
        scope: "stud",
        wallType: entity.id,
        level: entity.location?.level || "UNKNOWN",
        sheetRef: page.sheetId,
        viewRef: page.title,
        bbox: [0, 0, 0, 0],
        sourceNotes: [],
      },
      assumptions: [
        `Stud spacing: ${props.spacing || 16}" o.c.`,
        `Wall height: ${props.height || 8}'`,
        `Wall length: ${props.wallLength || 0}'`,
        `Corner studs: ${props.cornerStuds || 3}`,
        `T-intersection studs: ${props.tIntersectionStuds || 2}`,
      ],
      confidence: entity.confidence || 0.8,
      evidenceRefs: [{
        documentId: document.id,
        pageNumber: page.pageNumber,
        coordinates: entity.evidenceBox,
        description: `Stud entity: ${entity.type}`,
      }],
      quantificationRule: {
        ruleType: "stud_count",
        description: "Stud count = ceil(length / spacing) + corner studs",
        formula: `ceil(${props.wallLength || 0} / ${props.spacing || 16}) + ${props.cornerStuds || 3}`,
        assumptions: ["Standard stud spacing", "Corner stud count from typical details"],
        source: page.sheetId,
      },
    };
  }

  /**
   * Helper method to parse lumber size string
   */
  private parseSize(sizeStr: string): { thickness: number; width: number } | null {
    if (!sizeStr) return null;
    
    const match = sizeStr.match(/(\d+)x(\d+)/i);
    if (!match) return null;
    
    return {
      thickness: parseFloat(match[1]),
      width: parseFloat(match[2]),
    };
  }

  /**
   * Calculate joist count based on span and spacing
   */
  private calculateJoistCount(span: number, spacing: number): number {
    if (!span || !spacing) return 0;
    return Math.ceil((span * 12) / spacing) + 1; // +1 for end joist
  }

  /**
   * Calculate rafter count based on span and spacing
   */
  private calculateRafterCount(span: number, spacing: number, pitch: number): number {
    if (!span || !spacing) return 0;
    // Account for both sides of roof
    return Math.ceil((span * 12) / spacing) + 1;
  }

  /**
   * Calculate rafter length including pitch and overhang
   */
  private calculateRafterLength(span: number, pitch: number, overhang: number): number {
    if (!span || !pitch) return 0;
    const rise = (span / 2) * (pitch / 12);
    const run = span / 2;
    const rafterLength = Math.sqrt(rise * rise + run * run);
    return rafterLength + (overhang / 12); // Add overhang
  }

  /**
   * Calculate blocking length based on spacing and joist count
   */
  private calculateBlockingLength(spacing: number, joistCount: number): number {
    if (!spacing || !joistCount) return 0;
    const blockingRows = Math.ceil(spacing / 48); // Blocking every 4 feet
    return (joistCount - 1) * blockingRows * 14.5; // 14.5" typical joist depth
  }

  /**
   * Validate material capture completeness and generate flags
   */
  private validateMaterialCapture(lineItems: any[], drawingAnalysis: any): any[] {
    const flags: any[] = [];
    const materialCategories = new Map<string, number>();

    // Categorize captured materials (scope/material-aware)
    const canonical = new Set(["stud","plate","joist","rafter","beam","sheathing","connector"]);
    lineItems.forEach((item) => {
      const cat = this.getCategoryFromItem(item) || this.getCategoryFromItemId(String(item.itemId || ""));
      const category = canonical.has(cat) ? cat : "other";
      if (category !== "other") {
        materialCategories.set(category, (materialCategories.get(category) || 0) + 1);
      }
    });

    // Check for missing structural elements
    const hasJoists = materialCategories.has("joist");
    const hasRafters = materialCategories.has("rafter");
    const hasBeams = materialCategories.has("beam");
    const hasStuds = materialCategories.has("stud");
    const hasPlates = materialCategories.has("plate");
    const hasSheathing = materialCategories.has("sheathing");
    const hasConnectors = materialCategories.has("connector");

    // Flag missing structural elements based on drawing analysis
    if (drawingAnalysis?.pages) {
      const hasFloorPlan = drawingAnalysis.pages.some((p: any) => 
        p.classification === "plan" && p.title?.toLowerCase().includes("floor")
      );
      const hasRoofPlan = drawingAnalysis.pages.some((p: any) => 
        p.classification === "plan" && p.title?.toLowerCase().includes("roof")
      );
      const hasFramingPlan = drawingAnalysis.pages.some((p: any) => 
        p.title?.toLowerCase().includes("framing")
      );

      if (hasFloorPlan && !hasJoists) {
        flags.push({
          type: "MISSING_STRUCTURAL_ELEMENT",
          message: "Floor plan detected but no joists found in takeoff",
          severity: "medium",
          sheets: ["floor_plan"],
          resolved: false,
        });
      }

      if (hasRoofPlan && !hasRafters) {
        flags.push({
          type: "MISSING_STRUCTURAL_ELEMENT",
          message: "Roof plan detected but no rafters found in takeoff",
          severity: "medium",
          sheets: ["roof_plan"],
          resolved: false,
        });
      }

      if (hasFramingPlan && (!hasJoists && !hasRafters)) {
        flags.push({
          type: "MISSING_STRUCTURAL_ELEMENT",
          message: "Framing plan detected but no structural framing members found",
          severity: "high",
          sheets: ["framing_plan"],
          resolved: false,
        });
      }
    }

    // Check for incomplete specifications
    lineItems.forEach(item => {
      if (item.context.scope.toLowerCase().includes("joist") && !item.material.hangerType) {
        flags.push({
          type: "INCOMPLETE_SPECIFICATION",
          message: `Joist ${item.itemId} missing hanger specification`,
          severity: "low",
          sheets: [item.context.sheetRef],
          resolved: false,
        });
      }

      if (item.context.scope.toLowerCase().includes("beam") && !item.material.bearingLength) {
        flags.push({
          type: "INCOMPLETE_SPECIFICATION",
          message: `Beam ${item.itemId} missing bearing length specification`,
          severity: "medium",
          sheets: [item.context.sheetRef],
          resolved: false,
        });
      }

      if (item.confidence < 0.6) {
        flags.push({
          type: "LOW_CONFIDENCE_MATERIAL",
          message: `Low confidence (${Math.round(item.confidence * 100)}%) for ${item.itemId}`,
          severity: "medium",
          sheets: [item.context.sheetRef],
          resolved: false,
        });
      }
    });

    // Generate material completeness summary
    const totalCategories = materialCategories.size;
    const expectedCategories = 7; // studs, plates, joists, rafters, beams, sheathing, connectors

    if (totalCategories < expectedCategories * 0.7) {
      flags.push({
        type: "INCOMPLETE_MATERIAL_CAPTURE",
        message: `Only ${totalCategories} of ${expectedCategories} expected material categories found`,
        severity: "medium",
        sheets: ["all"],
        resolved: false,
      });
    }

    return flags;
  }

  /**
   * Get material category from item details (preferred)
   */
  private getCategoryFromItem(item: any): string {
    try {
      const scope = String(item?.context?.scope || "").toLowerCase();
      const spec = String(item?.material?.spec || "").toLowerCase();
      const size = String(item?.material?.size || "").toLowerCase();
      const conn = String(item?.material?.connectorType || "").toLowerCase();
      const header = String(item?.material?.headerType || "").toLowerCase();
      const text = [scope, spec, size, conn, header].join(" ");

      if (text.includes("stud")) return "stud";
      if (text.includes("plate")) return "plate";
      if (text.includes("joist")) return "joist";
      if (text.includes("rafter")) return "rafter";
      if (text.includes("beam") || text.includes("header")) return "beam";
      if (text.includes("sheathing") || text.includes("osb") || text.includes("plywood")) return "sheathing";
      if (
        text.includes("hanger") || text.includes("connector") || text.includes("strap") ||
        text.includes("tie") || text.includes("anchor") || text.includes("bolt") ||
        text.includes("hold-down") || text.includes("holddown") || text.includes("hd") || text.includes("simpson")
      ) return "connector";
      return "other";
    } catch {
      return "other";
    }
  }

  /**
   * Get material category from item ID
   */
  private getCategoryFromItemId(itemId: string): string {
    const lowerItemId = itemId.toLowerCase();
    
    if (lowerItemId.includes("joist")) return "joist";
    if (lowerItemId.includes("rafter")) return "rafter";
    if (lowerItemId.includes("beam") || lowerItemId.includes("header")) return "beam";
    if (lowerItemId.includes("stud")) return "stud";
    if (lowerItemId.includes("plate")) return "plate";
    if (lowerItemId.includes("blocking")) return "blocking";
    if (lowerItemId.includes("sheathing")) return "sheathing";
    if (lowerItemId.includes("hanger") || lowerItemId.includes("connector")) return "connector";
    if (lowerItemId.includes("fastener")) return "fastener";
    
    return "other";
  }



  async generateTakeoffFromProcessedDocuments(
    projectId: string,
    onProgress?: (progress: number) => void,
  ): Promise<string[]> {
    const store = useConstructionStore.getState();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found");

    const processed = project.documents.filter((d) => d.processed).map((d) => d.id);
    if (processed.length === 0) {
      throw new Error("No processed documents found. Please process documents first.");
    }
    return this.processMultipleDocuments(projectId, processed, onProgress);
  }
}

export const documentProcessingService = new DocumentProcessingService();
