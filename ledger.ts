import { InferenceLedger } from './InferenceLedger';
import { Evidence, Assumption, Inference, Decision, Flag } from './types';

export interface LedgerOptions {
  policyId: string;
  runId: string;
  docId?: string;
}

export class Ledger {
  private inferenceLedger: InferenceLedger;

  constructor(options: LedgerOptions) {
    this.inferenceLedger = new InferenceLedger(options.runId, options.policyId);
  }

  /**
   * Append evidence to the ledger
   */
  appendEvidence(evidence: Omit<Evidence, 'id'>): string {
    const evidenceWithId: Evidence = {
      ...evidence,
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    };
    
    return this.inferenceLedger.addEvidence(evidenceWithId);
  }

  /**
   * Append assumption to the ledger
   */
  appendAssumption(assumption: Omit<Assumption, 'id'>): string {
    const assumptionWithId: Assumption = {
      ...assumption,
      id: `ass_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    };
    
    return this.inferenceLedger.addAssumption(assumptionWithId);
  }

  /**
   * Append inference to the ledger
   */
  appendInference(inference: Omit<Inference<any>, 'id'>): string {
    const inferenceWithId: Inference<any> = {
      ...inference,
      id: `inf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    };
    
    return this.inferenceLedger.addInference(inferenceWithId);
  }

  /**
   * Append decision to the ledger
   */
  appendDecision(decision: Omit<Decision<any>, 'id'>): string {
    const decisionWithId: Decision<any> = {
      ...decision,
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    };
    
    return this.inferenceLedger.addDecision(decisionWithId);
  }

  /**
   * Append flag to the ledger
   */
  appendFlag(flag: Omit<Flag, 'id' | 'resolved'>): string {
    const flagWithId: Flag = {
      ...flag,
      id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      resolved: false,
    };
    
    return this.inferenceLedger.addFlag(flagWithId);
  }

  /**
   * Get ledger summary
   */
  getSummary() {
    return this.inferenceLedger.getSummary();
  }

  /**
   * Export ledger as JSON
   */
  toJSON() {
    return this.inferenceLedger.toJSON();
  }

  /**
   * Get underlying inference ledger
   */
  getInferenceLedger(): InferenceLedger {
    return this.inferenceLedger;
  }
}
