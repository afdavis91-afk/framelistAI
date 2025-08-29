import { InferenceLedger } from "../InferenceLedger";
import { Evidence, Assumption, Inference, Decision, Flag } from "../types";

export interface AuditBundle {
  decision: {
    id: string;
    topic: string;
    selectedValue: any;
    confidence: number;
    justification: string;
    timestamp: string;
  };
  inferences: Array<{
    id: string;
    value: any;
    confidence: number;
    method: string;
    explanation: string;
    isSelected: boolean;
  }>;
  evidenceIds: string[];
  assumptions: Array<{
    key: string;
    value: any;
    basis: string;
    confidence: number;
  }>;
  flags: Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
    resolved: boolean;
  }>;
}

// Mock ledger storage - in a real implementation this would come from persistent storage
const mockLedgers = new Map<string, InferenceLedger>();

/**
 * Get audit bundle for a specific decision
 * @param runId - The pipeline run ID
 * @param decisionId - The decision ID to get audit data for
 * @returns Promise<AuditBundle | null>
 */
export async function getAuditBundle(runId: string, decisionId: string): Promise<AuditBundle | null> {
  try {
    // In a real implementation, this would fetch from storage based on runId
    const ledger = mockLedgers.get(runId) || createMockLedger(runId);
    
    const decision = ledger.getDecision(decisionId);
    if (!decision) {
      return null;
    }

    // Get all inferences for this decision
    const selectedInference = ledger.getInference(decision.selectedInferenceId);
    const competingInferences = decision.competingInferences
      .map(id => ledger.getInference(id))
      .filter(Boolean) as Inference<any>[];

    const allInferences = [selectedInference, ...competingInferences].filter(Boolean) as Inference<any>[];

    // Collect all evidence IDs from inferences
    const evidenceIds = Array.from(new Set(
      allInferences.flatMap(inf => inf.usedEvidence)
    ));

    // Collect all assumptions from inferences
    const assumptionIds = Array.from(new Set(
      allInferences.flatMap(inf => inf.usedAssumptions)
    ));
    
    const assumptions = assumptionIds
      .map(id => ledger.getAssumption(id))
      .filter(Boolean) as Assumption[];

    // Get flags related to this decision
    const relatedFlags = ledger.flags.filter(flag => 
      flag.decisionId === decisionId ||
      flag.inferenceIds.some(id => allInferences.find(inf => inf.id === id))
    );

    return {
      decision: {
        id: decision.id,
        topic: decision.topic,
        selectedValue: decision.selectedValue,
        confidence: selectedInference?.confidence || 1.0,
        justification: decision.justification,
        timestamp: decision.timestamp,
      },
      inferences: allInferences.map(inf => ({
        id: inf.id,
        value: inf.value,
        confidence: inf.confidence,
        method: inf.method,
        explanation: inf.explanation,
        isSelected: inf.id === decision.selectedInferenceId,
      })),
      evidenceIds,
      assumptions: assumptions.map(assumption => ({
        key: assumption.key,
        value: assumption.value,
        basis: assumption.basis,
        confidence: assumption.confidence,
      })),
      flags: relatedFlags.map(flag => ({
        id: flag.id,
        type: flag.type,
        severity: flag.severity,
        message: flag.message,
        resolved: flag.resolved,
      })),
    };
  } catch (error) {
    console.error("Error getting audit bundle:", error);
    return null;
  }
}

/**
 * Create a mock ledger for demonstration purposes
 * In a real implementation, this would be loaded from storage
 */
function createMockLedger(runId: string): InferenceLedger {
  const ledger = new InferenceLedger(runId, "default_policy");
  
  // Add mock evidence
  const evidence1: Evidence = {
    id: "evidence_1",
    type: "schedule",
    source: {
      documentId: "doc_1",
      pageNumber: 1,
      extractor: "schedule_parser",
      confidence: 0.95,
    },
    content: { scheduleType: "joist", size: "2x10", spacing: 16 },
    metadata: {},
    timestamp: new Date().toISOString(),
    version: "1.0",
  };

  const evidence2: Evidence = {
    id: "evidence_2", 
    type: "text",
    source: {
      documentId: "doc_1",
      pageNumber: 2,
      extractor: "vision_llm",
      confidence: 0.85,
    },
    content: { text: "Floor joists shall be 2x10 @ 16\" o.c." },
    metadata: {},
    timestamp: new Date().toISOString(),
    version: "1.0",
  };

  // Add mock assumptions
  const assumption1: Assumption = {
    id: "assumption_1",
    key: "default_joist_spacing",
    value: 16,
    basis: "irc_code",
    source: "IRC R502.3.1",
    confidence: 0.9,
    timestamp: new Date().toISOString(),
  };

  // Add mock inferences
  const inference1: Inference = {
    id: "inference_1",
    topic: "joist_specification",
    value: { size: "2x10", spacing: 16, species: "SPF" },
    confidence: 0.92,
    method: "schedule_extraction",
    usedEvidence: ["evidence_1"],
    usedAssumptions: ["assumption_1"],
    explanation: "Extracted from joist schedule table",
    alternatives: [
      { value: { size: "2x8", spacing: 16 }, confidence: 0.15, reason: "Alternative size option" }
    ],
    timestamp: new Date().toISOString(),
    stage: "evidence_collection",
  };

  const inference2: Inference = {
    id: "inference_2",
    topic: "joist_specification", 
    value: { size: "2x10", spacing: 16, species: "Douglas Fir" },
    confidence: 0.85,
    method: "vision_analysis",
    usedEvidence: ["evidence_2"],
    usedAssumptions: ["assumption_1"],
    explanation: "Identified from plan notes via vision analysis",
    alternatives: [],
    timestamp: new Date().toISOString(),
    stage: "vision_enhancement",
  };

  // Add mock decision
  const decision1: Decision = {
    id: "decision_1",
    topic: "joist_specification",
    selectedValue: { size: "2x10", spacing: 16, species: "SPF" },
    selectedInferenceId: "inference_1",
    competingInferences: ["inference_2"],
    justification: "Schedule table has higher confidence than vision analysis",
    policyUsed: {
      thresholds: { acceptInference: 0.7 },
      tiebreakers: ["schedule_table"],
      appliedRules: ["prefer_schedule_over_vision"],
    },
    timestamp: new Date().toISOString(),
    stage: "decision_making",
  };

  // Add mock flag
  const flag1: Flag = {
    id: "flag_1",
    type: "CONFLICT",
    severity: "medium",
    message: "Species conflict between schedule (SPF) and vision analysis (Douglas Fir)",
    topic: "joist_specification",
    evidenceIds: ["evidence_1", "evidence_2"],
    assumptionIds: [],
    inferenceIds: ["inference_1", "inference_2"],
    decisionId: "decision_1",
    timestamp: new Date().toISOString(),
    resolved: false,
  };

  // Add all items to ledger
  ledger.addEvidence(evidence1);
  ledger.addEvidence(evidence2);
  ledger.addAssumption(assumption1);
  ledger.addInference(inference1);
  ledger.addInference(inference2);
  ledger.addDecision(decision1);
  ledger.addFlag(flag1);

  mockLedgers.set(runId, ledger);
  return ledger;
}