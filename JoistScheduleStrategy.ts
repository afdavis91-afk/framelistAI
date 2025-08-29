import { BaseStrategy, StrategyResult, StrategyContext } from '../base/BaseStrategy';
import { PipeCtx } from '../../types';

export interface JoistScheduleData {
  joistSize: string;
  joistSpacing: number;
  joistSpan: number;
  species?: string;
  grade?: string;
  treatment?: string;
  engineeredType?: 'I-joist' | 'LVL' | 'LSL' | 'PSL' | 'solid_sawn';
  blockingSpacing?: number;
  hangerType?: string;
  bridgingType?: string;
}

export class JoistScheduleStrategy extends BaseStrategy<JoistScheduleData> {
  public readonly name = 'JoistScheduleStrategy';
  public readonly topic = 'joist_schedule';
  public readonly method = 'fromScheduleTable';
  public readonly sourceType = 'schedule_table';

  canHandle(context: StrategyContext): boolean {
    // Check if we have table evidence for joist schedules
    const tableEvidence = this.findEvidenceByType('table', context.availableEvidence);
    return tableEvidence.some(evidence => 
      evidence.metadata.scheduleType === 'joist_schedule' ||
      evidence.content.joistSize ||
      evidence.content.joistSpacing ||
      evidence.content.joistSpan
    );
  }

  async execute(context: StrategyContext, ctx: PipeCtx): Promise<StrategyResult<JoistScheduleData>> {
    try {
      // Find joist schedule table evidence
      const tableEvidence = this.findEvidenceByType('table', context.availableEvidence)
        .filter(evidence => 
          evidence.metadata.scheduleType === 'joist_schedule' ||
          evidence.content.joistSize ||
          evidence.content.joistSpacing ||
          evidence.content.joistSpan
        );

      if (tableEvidence.length === 0) {
        return this.createFailureResult(
          'No joist schedule table evidence found',
          'No table evidence available for joist schedule extraction',
          [],
          []
        );
      }

      // Use the highest confidence table evidence
      const bestEvidence = tableEvidence.reduce((best, current) => 
        current.source.confidence > best.source.confidence ? current : best
      );

      // Extract joist data from table
      const joistData = this.extractJoistData(bestEvidence.content);
      
      if (!joistData) {
        return this.createFailureResult(
          'Failed to extract joist data from table',
          'Table content does not contain valid joist schedule information',
          [bestEvidence.id],
          []
        );
      }

      // Get relevant assumptions
      const speciesAssumption = this.getBestAssumption('joist_species', context.availableAssumptions);
      const gradeAssumption = this.getBestAssumption('joist_grade', context.availableAssumptions);
      const treatmentAssumption = this.getBestAssumption('joist_treatment', context.availableAssumptions);

      // Apply assumptions if data is missing
      if (!joistData.species && speciesAssumption) {
        joistData.species = speciesAssumption.value;
      }
      if (!joistData.grade && gradeAssumption) {
        joistData.grade = gradeAssumption.value;
      }
      if (!joistData.treatment && treatmentAssumption) {
        joistData.treatment = treatmentAssumption.value;
      }

      // Calculate confidence based on evidence quality and assumptions
      const evidenceQuality = bestEvidence.source.confidence;
      const assumptionReliability = this.getSourceReliability(ctx);
      const confidence = this.calculateConfidence(evidenceQuality, assumptionReliability, 0.9);

      // Collect used evidence and assumptions
      const usedEvidence = [bestEvidence.id];
      const usedAssumptions = [
        ...(speciesAssumption ? [speciesAssumption.id] : []),
        ...(gradeAssumption ? [gradeAssumption.id] : []),
        ...(treatmentAssumption ? [treatmentAssumption.id] : []),
      ];

      // Create alternatives based on available evidence
      const alternatives = this.createAlternatives(tableEvidence, context.availableAssumptions);

      const result = this.createSuccessResult(
        joistData,
        confidence,
        `Extracted joist schedule from table ${bestEvidence.metadata.tableId || 'unknown'}, joist size: ${joistData.joistSize}, spacing: ${joistData.joistSpacing}", span: ${joistData.joistSpan}"`,
        usedEvidence,
        usedAssumptions,
        alternatives
      );

      // Log execution
      this.logExecution(context, result, ctx);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createFailureResult(
        `Strategy execution failed: ${errorMessage}`,
        `Error occurred while extracting joist schedule data`,
        [],
        []
      );
    }
  }

  private extractJoistData(tableContent: any): JoistScheduleData | null {
    try {
      // Try to extract from structured table content
      if (tableContent.joistSize && tableContent.joistSpacing && tableContent.joistSpan) {
        return {
          joistSize: tableContent.joistSize,
          joistSpacing: Number(tableContent.joistSpacing),
          joistSpan: Number(tableContent.joistSpan),
          species: tableContent.species,
          grade: tableContent.grade,
          treatment: tableContent.treatment,
          engineeredType: tableContent.engineeredType,
          blockingSpacing: tableContent.blockingSpacing ? Number(tableContent.blockingSpacing) : undefined,
          hangerType: tableContent.hangerType,
          bridgingType: tableContent.bridgingType,
        };
      }

      // Try to extract from array format
      if (Array.isArray(tableContent)) {
        const firstRow = tableContent[0];
        if (firstRow && firstRow.joistSize) {
          return {
            joistSize: firstRow.joistSize,
            joistSpacing: Number(firstRow.joistSpacing) || 16,
            joistSpan: Number(firstRow.joistSpan) || 0,
            species: firstRow.species,
            grade: firstRow.grade,
            treatment: firstRow.treatment,
            engineeredType: firstRow.engineeredType,
            blockingSpacing: firstRow.blockingSpacing ? Number(firstRow.blockingSpacing) : undefined,
            hangerType: firstRow.hangerType,
            bridgingType: firstRow.bridgingType,
          };
        }
      }

      // Try to extract from raw text (fallback)
      if (typeof tableContent === 'string') {
        const joistMatch = tableContent.match(/joist[:\s]+([^,\n]+)/i);
        const spacingMatch = tableContent.match(/spacing[:\s]+(\d+)/i);
        const spanMatch = tableContent.match(/span[:\s]+(\d+)/i);
        
        if (joistMatch) {
          return {
            joistSize: joistMatch[1].trim(),
            joistSpacing: spacingMatch ? Number(spacingMatch[1]) : 16,
            joistSpan: spanMatch ? Number(spanMatch[1]) : 0,
          };
        }
      }

      return null;
    } catch (error) {
      console.warn('Failed to extract joist data from table content:', error);
      return null;
    }
  }

  private createAlternatives(
    tableEvidence: any[],
    availableAssumptions: any[]
  ): Array<{value: JoistScheduleData, confidence: number, reason: string}> {
    const alternatives: Array<{value: JoistScheduleData, confidence: number, reason: string}> = [];

    // Create alternatives from other table evidence
    for (const evidence of tableEvidence) {
      if (evidence.source.confidence < 0.8) continue; // Only consider high-confidence alternatives
      
      const joistData = this.extractJoistData(evidence.content);
      if (joistData) {
        alternatives.push({
          value: joistData,
          confidence: evidence.source.confidence * 0.8, // Slightly lower confidence for alternatives
          reason: `Alternative from table evidence ${evidence.id}`,
        });
      }
    }

    // Create alternatives from assumptions
    const defaultSpecies = this.getBestAssumption('joist_species', availableAssumptions);
    const defaultGrade = this.getBestAssumption('joist_grade', availableAssumptions);
    
    if (defaultSpecies || defaultGrade) {
      alternatives.push({
        value: {
          joistSize: '2x10', // Default size
          joistSpacing: 16,  // Default spacing
          joistSpan: 0,      // Unknown span
          species: defaultSpecies?.value,
          grade: defaultGrade?.value,
        },
        confidence: 0.6,
        reason: 'Default values based on assumptions',
      });
    }

    return alternatives;
  }
}
