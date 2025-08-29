import { Stage, PipeCtx, Evidence } from '../types';
import { ProjectDocument } from '../../types/construction';

export interface EvidenceCollectionInput {
  document: ProjectDocument;
  projectDocuments?: ProjectDocument[];
}

export interface EvidenceCollectionOutput {
  evidence: Evidence[];
  documentId: string;
  totalEvidence: number;
}

export class EvidenceCollectionStage implements Stage<EvidenceCollectionInput, EvidenceCollectionOutput> {
  public readonly name = 'EvidenceCollection';

  async execute(input: EvidenceCollectionInput, ctx: PipeCtx): Promise<EvidenceCollectionOutput> {
    ctx.logStageEntry(this.name);
    
    try {
      const { document, projectDocuments } = input;
      const evidence: Evidence[] = [];

      // Set shared data for child contexts
      ctx.setStageData('document', document);
      ctx.setStageData('projectDocuments', projectDocuments);

      // Step 1: Collect text evidence from PDF
      const textEvidence = await this.collectTextEvidence(document, ctx);
      evidence.push(...textEvidence);

      // Step 2: Collect table evidence from schedules
      const tableEvidence = await this.collectTableEvidence(document, ctx);
      evidence.push(...tableEvidence);

      // Step 3: Collect symbol evidence from drawings
      const symbolEvidence = await this.collectSymbolEvidence(document, ctx);
      evidence.push(...symbolEvidence);

      // Step 4: Collect dimension evidence
      const dimensionEvidence = await this.collectDimensionEvidence(document, ctx);
      evidence.push(...dimensionEvidence);

      // Step 5: Collect Vision-based evidence if enabled
      if (ctx.isFeatureEnabled('enableVisionStrategies')) {
        const visionEvidence = await this.collectVisionEvidence(document, ctx);
        evidence.push(...visionEvidence);
      }

      // Add all evidence to the ledger
      for (const ev of evidence) {
        ctx.ledger.addEvidence(ev);
      }

      const output: EvidenceCollectionOutput = {
        evidence,
        documentId: document.id,
        totalEvidence: evidence.length,
      };

      ctx.logStageExit(this.name, true);
      return output;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Evidence collection failed:`, errorMessage);
      
      ctx.logStageExit(this.name, false);
      throw error;
    }
  }

  /**
   * Collect text evidence from PDF content
   */
  private async collectTextEvidence(document: ProjectDocument, ctx: PipeCtx): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      // This would typically involve OCR or text extraction from PDF
      // For now, we'll create placeholder evidence
      const textEvidence: Evidence = {
        id: `ev_text_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: 'text',
        source: {
          documentId: document.id,
          pageNumber: 1,
          extractor: 'pdf_text_extractor',
          confidence: 0.9,
        },
        content: {
          text: `Sample text content from ${document.name}`,
          extractedAt: new Date().toISOString(),
        },
        metadata: {
          contentType: 'general_text',
          language: 'en',
        },
        timestamp: new Date().toISOString(),
        version: '1.0',
      };

      evidence.push(textEvidence);
      
    } catch (error) {
      console.warn('Failed to collect text evidence:', error);
    }

    return evidence;
  }

  /**
   * Collect table evidence from schedules
   */
  private async collectTableEvidence(document: ProjectDocument, ctx: PipeCtx): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      // This would typically involve table detection and parsing
      // For now, we'll create placeholder evidence for joist schedules
      if (document.type === 'structural') {
        const joistScheduleEvidence: Evidence = {
          id: `ev_table_joist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'table',
          source: {
            documentId: document.id,
            pageNumber: 5,
            extractor: 'table_parser',
            confidence: 0.95,
          },
          content: {
            scheduleType: 'joist_schedule',
            tableId: 'A2.1',
            rows: [
              {
                joistSize: '2x10',
                joistSpacing: 16,
                joistSpan: 14,
                species: 'SPF',
                grade: 'No.2',
              },
            ],
          },
          metadata: {
            tableType: 'joist_schedule',
            rowCount: 1,
            columnCount: 5,
          },
          timestamp: new Date().toISOString(),
          version: '1.0',
        };

        evidence.push(joistScheduleEvidence);
      }
      
    } catch (error) {
      console.warn('Failed to collect table evidence:', error);
    }

    return evidence;
  }

  /**
   * Collect symbol evidence from drawings
   */
  private async collectSymbolEvidence(document: ProjectDocument, ctx: PipeCtx): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      // This would typically involve symbol recognition from drawings
      // For now, we'll create placeholder evidence
      if (document.type === 'architectural' || document.type === 'structural') {
        const symbolEvidence: Evidence = {
          id: `ev_symbol_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'symbol',
          source: {
            documentId: document.id,
            pageNumber: 1,
            extractor: 'symbol_recognition',
            confidence: 0.8,
          },
          content: {
            symbolType: 'wall_symbol',
            location: { x: 0.5, y: 0.5 },
            properties: {
              wallType: 'exterior',
              thickness: 6,
            },
          },
          metadata: {
            symbolLibrary: 'standard_architectural',
            recognitionMethod: 'template_matching',
          },
          timestamp: new Date().toISOString(),
          version: '1.0',
        };

        evidence.push(symbolEvidence);
      }
      
    } catch (error) {
      console.warn('Failed to collect symbol evidence:', error);
    }

    return evidence;
  }

  /**
   * Collect dimension evidence from drawings
   */
  private async collectDimensionEvidence(document: ProjectDocument, ctx: PipeCtx): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      // This would typically involve dimension line detection
      // For now, we'll create placeholder evidence
      if (document.type === 'architectural' || document.type === 'structural') {
        const dimensionEvidence: Evidence = {
          id: `ev_dimension_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: 'dimension',
          source: {
            documentId: document.id,
            pageNumber: 1,
            extractor: 'dimension_extractor',
            confidence: 0.85,
          },
          content: {
            value: 120,
            units: 'inches',
            dimensionType: 'linear',
            startPoint: { x: 0.1, y: 0.1 },
            endPoint: { x: 0.9, y: 0.1 },
          },
          metadata: {
            precision: 0.125,
            tolerance: 0.25,
          },
          timestamp: new Date().toISOString(),
          version: '1.0',
        };

        evidence.push(dimensionEvidence);
      }
      
    } catch (error) {
      console.warn('Failed to collect dimension evidence:', error);
    }

    return evidence;
  }

  /**
   * Collect Vision-based evidence using AI analysis
   */
  private async collectVisionEvidence(document: ProjectDocument, ctx: PipeCtx): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      // This would typically involve calling Vision APIs
      // For now, we'll create placeholder evidence
      const visionEvidence: Evidence = {
        id: `ev_vision_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: 'image',
        source: {
          documentId: document.id,
          pageNumber: 1,
          extractor: 'vision_llm',
          confidence: 0.75,
        },
        content: {
          analysis: 'AI-powered analysis of drawing content',
          detectedElements: ['walls', 'openings', 'dimensions'],
          confidence: 0.75,
        },
        metadata: {
          visionModel: 'claude-3-sonnet',
          tokensUsed: 1500,
          analysisType: 'drawing_comprehension',
        },
        timestamp: new Date().toISOString(),
        version: '1.0',
      };

      evidence.push(visionEvidence);
      
    } catch (error) {
      console.warn('Failed to collect Vision evidence:', error);
    }

    return evidence;
  }

  validateInput(input: EvidenceCollectionInput): boolean {
    return !!(input.document && input.document.id);
  }

  validateOutput(output: EvidenceCollectionOutput): boolean {
    return !!(output.evidence && Array.isArray(output.evidence) && output.documentId);
  }
}
