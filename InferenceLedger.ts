import { 
  InferenceLedger as IInferenceLedger,
  Evidence, 
  Assumption, 
  Inference, 
  Decision, 
  Flag,
  EvidenceSchema,
  AssumptionSchema,
  InferenceSchema,
  DecisionSchema,
  FlagSchema,
  InferenceLedgerSchema
} from './types';

export class InferenceLedger implements IInferenceLedger {
  public id: string;
  public runId: string;
  public policyId: string;
  public evidence: Evidence[] = [];
  public assumptions: Assumption[] = [];
  public inferences: Inference<any>[] = [];
  public decisions: Decision<any>[] = [];
  public flags: Flag[] = [];
  public metadata: {
    createdAt: string;
    completedAt?: string;
    totalStages: number;
    successStages: number;
  };

  constructor(runId: string, policyId: string) {
    this.id = `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.runId = runId;
    this.policyId = policyId;
    this.metadata = {
      createdAt: new Date().toISOString(),
      totalStages: 0,
      successStages: 0,
    };
  }

  /**
   * Add evidence to the ledger with validation
   */
  addEvidence(evidence: Evidence): string {
    try {
      EvidenceSchema.parse(evidence);
      this.evidence.push(evidence);
      return evidence.id;
    } catch (error) {
      throw new Error(`Invalid evidence: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add assumption to the ledger with validation
   */
  addAssumption(assumption: Assumption): string {
    try {
      AssumptionSchema.parse(assumption);
      
      // Handle supersession
      if (assumption.supersedes) {
        const existingIndex = this.assumptions.findIndex(a => a.id === assumption.supersedes);
        if (existingIndex !== -1) {
          this.assumptions[existingIndex] = {
            ...this.assumptions[existingIndex],
            expiresAt: new Date().toISOString(),
          };
        }
      }
      
      this.assumptions.push(assumption);
      return assumption.id;
    } catch (error) {
      throw new Error(`Invalid assumption: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add inference to the ledger with validation
   */
  addInference(inference: Inference<any>): string {
    try {
      InferenceSchema.parse(inference);
      
      // Validate that referenced evidence and assumptions exist
      this.validateReferences(inference.usedEvidence, inference.usedAssumptions);
      
      this.inferences.push(inference);
      return inference.id;
    } catch (error) {
      throw new Error(`Invalid inference: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add decision to the ledger with validation
   */
  addDecision(decision: Decision<any>): string {
    try {
      DecisionSchema.parse(decision);
      
      // Validate that referenced inference exists
      if (!this.inferences.find(i => i.id === decision.selectedInferenceId)) {
        throw new Error(`Referenced inference ${decision.selectedInferenceId} not found`);
      }
      
      this.decisions.push(decision);
      return decision.id;
    } catch (error) {
      throw new Error(`Invalid decision: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add flag to the ledger with validation
   */
  addFlag(flag: Flag): string {
    try {
      FlagSchema.parse(flag);
      
      // Validate that referenced entities exist
      this.validateReferences(flag.evidenceIds, flag.assumptionIds, flag.inferenceIds);
      
      this.flags.push(flag);
      return flag.id;
    } catch (error) {
      throw new Error(`Invalid flag: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get evidence by ID
   */
  getEvidence(id: string): Evidence | undefined {
    return this.evidence.find(e => e.id === id);
  }

  /**
   * Get assumption by ID
   */
  getAssumption(id: string): Assumption | undefined {
    return this.assumptions.find(a => a.id === id);
  }

  /**
   * Get inference by ID
   */
  getInference(id: string): Inference<any> | undefined {
    return this.inferences.find(i => i.id === id);
  }

  /**
   * Get decision by ID
   */
  getDecision(id: string): Decision<any> | undefined {
    return this.decisions.find(d => d.id === id);
  }

  /**
   * Get flag by ID
   */
  getFlag(id: string): Flag | undefined {
    return this.flags.find(f => f.id === id);
  }

  /**
   * Get inferences by topic
   */
  getInferencesByTopic(topic: string): Inference<any>[] {
    return this.inferences.filter(i => i.topic === topic);
  }

  /**
   * Get decisions by topic
   */
  getDecisionsByTopic(topic: string): Decision<any>[] {
    return this.decisions.filter(d => d.topic === topic);
  }

  /**
   * Get active assumptions (not expired)
   */
  getActiveAssumptions(): Assumption[] {
    const now = new Date().toISOString();
    return this.assumptions.filter(a => !a.expiresAt || a.expiresAt > now);
  }

  /**
   * Get assumptions by key
   */
  getAssumptionsByKey(key: string): Assumption[] {
    return this.assumptions.filter(a => a.key === key);
  }

  /**
   * Get current assumption for a key (highest confidence, not expired)
   */
  getCurrentAssumption(key: string): Assumption | undefined {
    const active = this.getActiveAssumptions().filter(a => a.key === key);
    if (active.length === 0) return undefined;
    
    return active.reduce((highest, current) => 
      current.confidence > highest.confidence ? current : highest
    );
  }

  /**
   * Update stage progress
   */
  updateStageProgress(totalStages: number, successStages: number): void {
    this.metadata.totalStages = totalStages;
    this.metadata.successStages = successStages;
  }

  /**
   * Mark ledger as completed
   */
  markCompleted(): void {
    this.metadata.completedAt = new Date().toISOString();
  }

  /**
   * Get ledger summary statistics
   */
  getSummary(): {
    totalEvidence: number;
    totalAssumptions: number;
    totalInferences: number;
    totalDecisions: number;
    totalFlags: number;
    unresolvedFlags: number;
    averageConfidence: number;
  } {
    const unresolvedFlags = this.flags.filter(f => !f.resolved).length;
    const allConfidences = [
      ...this.evidence.map(e => e.source.confidence),
      ...this.assumptions.map(a => a.confidence),
      ...this.inferences.map(i => i.confidence),
      ...this.decisions.map(d => 1.0), // Decisions are always 100% confident
    ];
    
    const averageConfidence = allConfidences.length > 0 
      ? allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length
      : 0;

    return {
      totalEvidence: this.evidence.length,
      totalAssumptions: this.assumptions.length,
      totalInferences: this.inferences.length,
      totalDecisions: this.decisions.length,
      totalFlags: this.flags.length,
      unresolvedFlags,
      averageConfidence,
    };
  }

  /**
   * Export ledger as JSON
   */
  toJSON(): IInferenceLedger {
    return {
      id: this.id,
      runId: this.runId,
      policyId: this.policyId,
      evidence: this.evidence,
      assumptions: this.assumptions,
      inferences: this.inferences,
      decisions: this.decisions,
      flags: this.flags,
      metadata: this.metadata,
    };
  }

  /**
   * Validate ledger integrity
   */
  validateIntegrity(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      InferenceLedgerSchema.parse(this.toJSON());
    } catch (error) {
      errors.push(`Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check for orphaned references
    const evidenceIds = new Set(this.evidence.map(e => e.id));
    const assumptionIds = new Set(this.assumptions.map(a => a.id));
    const inferenceIds = new Set(this.inferences.map(i => i.id));
    const decisionIds = new Set(this.decisions.map(d => d.id));

    // Check evidence references
    for (const inference of this.inferences) {
      for (const evidenceId of inference.usedEvidence) {
        if (!evidenceIds.has(evidenceId)) {
          errors.push(`Inference ${inference.id} references non-existent evidence ${evidenceId}`);
        }
      }
      for (const assumptionId of inference.usedAssumptions) {
        if (!assumptionIds.has(assumptionId)) {
          errors.push(`Inference ${inference.id} references non-existent assumption ${assumptionId}`);
        }
      }
    }

    // Check decision references
    for (const decision of this.decisions) {
      if (!inferenceIds.has(decision.selectedInferenceId)) {
        errors.push(`Decision ${decision.id} references non-existent inference ${decision.selectedInferenceId}`);
      }
      for (const inferenceId of decision.competingInferences) {
        if (!inferenceIds.has(inferenceId)) {
          errors.push(`Decision ${decision.id} references non-existent inference ${inferenceId}`);
        }
      }
    }

    // Check flag references
    for (const flag of this.flags) {
      for (const evidenceId of flag.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          errors.push(`Flag ${flag.id} references non-existent evidence ${evidenceId}`);
        }
      }
      for (const assumptionId of flag.assumptionIds) {
        if (!assumptionIds.has(assumptionId)) {
          errors.push(`Flag ${flag.id} references non-existent assumption ${assumptionId}`);
        }
      }
      for (const inferenceId of flag.inferenceIds) {
        if (!inferenceIds.has(inferenceId)) {
          errors.push(`Flag ${flag.id} references non-existent inference ${inferenceId}`);
        }
      }
      if (flag.decisionId && !decisionIds.has(flag.decisionId)) {
        errors.push(`Flag ${flag.id} references non-existent decision ${flag.decisionId}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate that referenced entities exist
   */
  private validateReferences(
    evidenceIds: string[], 
    assumptionIds: string[], 
    inferenceIds: string[] = []
  ): void {
    const missingEvidence = evidenceIds.filter(id => !this.evidence.find(e => e.id === id));
    const missingAssumptions = assumptionIds.filter(id => !this.assumptions.find(a => a.id === id));
    const missingInferences = inferenceIds.filter(id => !this.inferences.find(i => i.id === id));

    if (missingEvidence.length > 0) {
      throw new Error(`Missing evidence: ${missingEvidence.join(', ')}`);
    }
    if (missingAssumptions.length > 0) {
      throw new Error(`Missing assumptions: ${missingAssumptions.join(', ')}`);
    }
    if (missingInferences.length > 0) {
      throw new Error(`Missing inferences: ${missingInferences.join(', ')}`);
    }
  }
}
