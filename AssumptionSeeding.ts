import { Stage, PipeCtx, Assumption } from '../types';
import { EvidenceCollectionOutput } from './EvidenceCollection';

export interface AssumptionSeedingInput extends EvidenceCollectionOutput {}

export interface AssumptionSeedingOutput {
  assumptions: Assumption[];
  totalAssumptions: number;
}

export class AssumptionSeedingStage implements Stage<AssumptionSeedingInput, AssumptionSeedingOutput> {
  public readonly name = 'AssumptionSeeding';

  async execute(input: AssumptionSeedingInput, ctx: PipeCtx): Promise<AssumptionSeedingOutput> {
    ctx.logStageEntry(this.name);
    
    try {
      const assumptions: Assumption[] = [];

      // Step 1: Seed IRC code defaults
      const ircDefaults = this.seedIRCDefaults(ctx);
      assumptions.push(...ircDefaults);

      // Step 2: Seed regional defaults
      const regionalDefaults = this.seedRegionalDefaults(ctx);
      assumptions.push(...regionalDefaults);

      // Step 3: Extract document-derived assumptions
      const documentAssumptions = this.extractDocumentAssumptions(input.evidence, ctx);
      assumptions.push(...documentAssumptions);

      // Step 4: Load user overrides if available
      const userOverrides = await this.loadUserOverrides(ctx);
      assumptions.push(...userOverrides);

      // Add all assumptions to the ledger
      for (const assumption of assumptions) {
        ctx.ledger.addAssumption(assumption);
      }

      const output: AssumptionSeedingOutput = {
        assumptions,
        totalAssumptions: assumptions.length,
      };

      ctx.logStageExit(this.name, true);
      return output;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Assumption seeding failed:`, errorMessage);
      
      ctx.logStageExit(this.name, false);
      throw error;
    }
  }

  /**
   * Seed IRC code default assumptions
   */
  private seedIRCDefaults(ctx: PipeCtx): Assumption[] {
    const assumptions: Assumption[] = [];
    const timestamp = new Date().toISOString();

    // Live load assumptions
    assumptions.push({
      id: `ass_irc_live_load_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'live_load',
      value: 40,
      basis: 'irc_code',
      source: 'IRC R301.5 - Minimum Design Loads',
      confidence: 0.95,
      timestamp,
    });

    // Dead load assumptions
    assumptions.push({
      id: `ass_irc_dead_load_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'dead_load',
      value: 10,
      basis: 'irc_code',
      source: 'IRC R301.5 - Minimum Design Loads',
      confidence: 0.95,
      timestamp,
    });

    // Stud spacing defaults
    assumptions.push({
      id: `ass_irc_stud_spacing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'stud_spacing_default',
      value: 16,
      basis: 'irc_code',
      source: 'IRC R602.3 - Wall Construction',
      confidence: 0.9,
      timestamp,
    });

    // Corner stud count defaults
    assumptions.push({
      id: `ass_irc_corner_studs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'corner_stud_count',
      value: 3,
      basis: 'irc_code',
      source: 'IRC R602.3.1 - Corner Posts',
      confidence: 0.9,
      timestamp,
    });

    // T-intersection stud count defaults
    assumptions.push({
      id: `ass_irc_t_intersection_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 't_intersection_stud_count',
      value: 2,
      basis: 'irc_code',
      source: 'IRC R602.3.2 - T-Intersection Posts',
      confidence: 0.9,
      timestamp,
    });

    // Header bearing length defaults
    assumptions.push({
      id: `ass_irc_header_bearing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'header_bearing_length',
      value: 3.5,
      basis: 'irc_code',
      source: 'IRC R602.7 - Headers',
      confidence: 0.9,
      timestamp,
    });

    // Sheathing nailing defaults
    assumptions.push({
      id: `ass_irc_sheathing_edge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'sheathing_edge_spacing',
      value: 6,
      basis: 'irc_code',
      source: 'IRC R602.3.3 - Sheathing',
      confidence: 0.85,
      timestamp,
    });

    assumptions.push({
      id: `ass_irc_sheathing_field_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'sheathing_field_spacing',
      value: 12,
      basis: 'irc_code',
      source: 'IRC R602.3.3 - Sheathing',
      confidence: 0.85,
      timestamp,
    });

    return assumptions;
  }

  /**
   * Seed regional default assumptions
   */
  private seedRegionalDefaults(ctx: PipeCtx): Assumption[] {
    const assumptions: Assumption[] = [];
    const timestamp = new Date().toISOString();

    // Default species assumptions (can be overridden by user)
    assumptions.push({
      id: `ass_regional_species_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'default_species',
      value: 'SPF',
      basis: 'regional_default',
      source: 'Regional availability and cost',
      confidence: 0.8,
      timestamp,
    });

    // Default grade assumptions
    assumptions.push({
      id: `ass_regional_grade_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'default_grade',
      value: 'No.2',
      basis: 'regional_default',
      source: 'Standard structural grade',
      confidence: 0.8,
      timestamp,
    });

    // Default treatment assumptions
    assumptions.push({
      id: `ass_regional_treatment_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'default_treatment',
      value: 'none',
      basis: 'regional_default',
      source: 'Standard framing lumber',
      confidence: 0.8,
      timestamp,
    });

    // Joist hanger defaults
    assumptions.push({
      id: `ass_regional_joist_hanger_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      key: 'joist_hanger_type',
      value: 'joist_hanger',
      basis: 'regional_default',
      source: 'Standard connection method',
      confidence: 0.75,
      timestamp,
    });

    return assumptions;
  }

  /**
   * Extract assumptions from document evidence
   */
  private extractDocumentAssumptions(evidence: any[], ctx: PipeCtx): Assumption[] {
    const assumptions: Assumption[] = [];
    const timestamp = new Date().toISOString();

    for (const ev of evidence) {
      try {
        // Extract assumptions from text evidence
        if (ev.type === 'text' && ev.content.text) {
          const textAssumptions = this.extractTextAssumptions(ev, ctx);
          assumptions.push(...textAssumptions);
        }

        // Extract assumptions from table evidence
        if (ev.type === 'table' && ev.content.scheduleType) {
          const tableAssumptions = this.extractTableAssumptions(ev, ctx);
          assumptions.push(...tableAssumptions);
        }

        // Extract assumptions from symbol evidence
        if (ev.type === 'symbol' && ev.content.symbolType) {
          const symbolAssumptions = this.extractSymbolAssumptions(ev, ctx);
          assumptions.push(...symbolAssumptions);
        }

      } catch (error) {
        console.warn(`Failed to extract assumptions from evidence ${ev.id}:`, error);
      }
    }

    return assumptions;
  }

  /**
   * Extract assumptions from text content
   */
  private extractTextAssumptions(evidence: any, ctx: PipeCtx): Assumption[] {
    const assumptions: Assumption[] = [];
    const text = evidence.content.text.toLowerCase();

    // Look for seismic category mentions
    if (text.includes('seismic') || text.includes('earthquake')) {
      if (text.includes('category a') || text.includes('seismic a')) {
        assumptions.push({
          id: `ass_doc_seismic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          key: 'seismic_category',
          value: 'A',
          basis: 'document_derived',
          source: `Text evidence from ${evidence.source.documentId}`,
          confidence: 0.8,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Look for wind category mentions
    if (text.includes('wind') || text.includes('hurricane')) {
      if (text.includes('category 1') || text.includes('wind 1')) {
        assumptions.push({
          id: `ass_doc_wind_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          key: 'wind_category',
          value: 1,
          basis: 'document_derived',
          source: `Text evidence from ${evidence.source.documentId}`,
          confidence: 0.8,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Look for building code mentions
    if (text.includes('irc') || text.includes('international residential code')) {
      assumptions.push({
        id: `ass_doc_building_code_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        key: 'building_code',
        value: 'IRC',
        basis: 'document_derived',
        source: `Text evidence from ${evidence.source.documentId}`,
        confidence: 0.9,
        timestamp: new Date().toISOString(),
      });
    }

    return assumptions;
  }

  /**
   * Extract assumptions from table content
   */
  private extractTableAssumptions(evidence: any, ctx: PipeCtx): Assumption[] {
    const assumptions: Assumption[] = [];

    // Extract joist-related assumptions from joist schedules
    if (evidence.content.scheduleType === 'joist_schedule' && evidence.content.rows) {
      for (const row of evidence.content.rows) {
        if (row.species) {
          assumptions.push({
            id: `ass_doc_joist_species_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            key: 'joist_species',
            value: row.species,
            basis: 'document_derived',
            source: `Joist schedule from ${evidence.source.documentId}`,
            confidence: 0.9,
            timestamp: new Date().toISOString(),
          });
        }

        if (row.grade) {
          assumptions.push({
            id: `ass_doc_joist_grade_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            key: 'joist_grade',
            value: row.grade,
            basis: 'document_derived',
            source: `Joist schedule from ${evidence.source.documentId}`,
            confidence: 0.9,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    return assumptions;
  }

  /**
   * Extract assumptions from symbol content
   */
  private extractSymbolAssumptions(evidence: any, ctx: PipeCtx): Assumption[] {
    const assumptions: Assumption[] = [];

    // Extract wall type assumptions from wall symbols
    if (evidence.content.symbolType === 'wall_symbol' && evidence.content.properties) {
      const props = evidence.content.properties;
      
      if (props.wallType) {
        assumptions.push({
          id: `ass_doc_wall_type_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          key: 'wall_type',
          value: props.wallType,
          basis: 'document_derived',
          source: `Wall symbol from ${evidence.source.documentId}`,
          confidence: 0.85,
          timestamp: new Date().toISOString(),
        });
      }

      if (props.thickness) {
        assumptions.push({
          id: `ass_doc_wall_thickness_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          key: 'wall_thickness',
          value: props.thickness,
          basis: 'document_derived',
          source: `Wall symbol from ${evidence.source.documentId}`,
          confidence: 0.85,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return assumptions;
  }

  /**
   * Load user override assumptions
   */
  private async loadUserOverrides(ctx: PipeCtx): Promise<Assumption[]> {
    const assumptions: Assumption[] = [];
    
    try {
      // This would typically load from user preferences or project settings
      // For now, we'll return an empty array
      // In a real implementation, this would:
      // 1. Check user project settings
      // 2. Load from user preferences
      // 3. Apply project-specific overrides
      
    } catch (error) {
      console.warn('Failed to load user overrides:', error);
    }

    return assumptions;
  }

  validateInput(input: AssumptionSeedingInput): boolean {
    return !!(input.evidence && Array.isArray(input.evidence) && input.documentId);
  }

  validateOutput(output: AssumptionSeedingOutput): boolean {
    return !!(output.assumptions && Array.isArray(output.assumptions));
  }
}
