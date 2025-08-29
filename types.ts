import { z } from "zod";

// Core pipeline types
export interface Evidence {
  id: string;
  type: "text" | "image" | "table" | "symbol" | "dimension" | "schedule";
  source: {
    documentId: string;
    pageNumber: number;
    bbox?: [number, number, number, number];
    extractor: string;
    confidence: number;
  };
  content: any;
  metadata: Record<string, any>;
  timestamp: string;
  version: string;
}

export interface Assumption {
  id: string;
  key: string; // e.g., "live_load", "stud_spacing_default"
  value: any;
  basis: "irc_code" | "user_override" | "document_derived" | "regional_default";
  source?: string; // IRC section, user input, document reference
  confidence: number;
  supersedes?: string; // ID of previous assumption
  timestamp: string;
  expiresAt?: string;
}

export interface Inference<T = any> {
  id: string;
  topic: string; // e.g., "joist_schedule", "wall_type_legend"
  value: T;
  confidence: number;
  method: string; // e.g., "fromScheduleTable", "fromVisionLLM"
  usedEvidence: string[]; // Evidence IDs
  usedAssumptions: string[]; // Assumption IDs
  explanation: string;
  alternatives: Array<{value: T, confidence: number, reason: string}>;
  timestamp: string;
  stage: string;
}

export interface Decision<T = any> {
  id: string;
  topic: string;
  selectedValue: T;
  selectedInferenceId: string;
  competingInferences: string[]; // Inference IDs
  justification: string;
  policyUsed: {
    thresholds: Record<string, number>;
    tiebreakers: string[];
    appliedRules: string[];
  };
  timestamp: string;
  stage: string;
}

export interface Flag {
  id: string;
  type: "CONFLICT" | "MISSING_INFO" | "LOW_CONFIDENCE" | "POLICY_VIOLATION";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  topic?: string;
  evidenceIds: string[];
  assumptionIds: string[];
  inferenceIds: string[];
  decisionId?: string;
  timestamp: string;
  resolved: boolean;
}

export interface Policy {
  id: string;
  version: string;
  thresholds: {
    acceptInference: number; // 0.7
    conflictGap: number; // 0.15
    maxAmbiguity: number; // 0.3
  };
  priors: {
    sourceReliability: Record<string, number>; // schedule: 0.9, notes: 0.7, vision: 0.8
  };
  tiebreakers: string[]; // ["schedule_table", "explicit_note", "plan_symbol", "vision_llm"]
  extraction: {
    maxVisionTokens: number;
    maxPages: number;
    enableGeometry: boolean;
  };
  pricing: {
    minAccept: number;
    maxConcurrent: number;
    retries: number;
    timeoutMs: number;
    jitterMs: number;
    maxQuoteAgeDays: number;
    currency: string;
    fxRate?: number;
    priceAsOf?: string;
    vendorPrefs?: string[];
  };
}

export interface InferenceLedger {
  id: string;
  runId: string;
  policyId: string;
  evidence: Evidence[];
  assumptions: Assumption[];
  inferences: Inference<any>[];
  decisions: Decision<any>[];
  flags: Flag[];
  metadata: {
    createdAt: string;
    completedAt?: string;
    totalStages: number;
    successStages: number;
  };
}

export interface PipeCtx {
  ledger: InferenceLedger;
  policy: Policy;
  stage: string;
  stageData: Record<string, any>;
  metadata: {
    traceId: string;
    scenarioId?: string;
    userId?: string;
  };
}

export interface Stage<I, O> {
  name: string;
  execute(input: I, ctx: PipeCtx): Promise<O>;
  validateInput?(input: I): boolean;
  validateOutput?(output: O): boolean;
}

// Zod schemas for validation
export const EvidenceSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "table", "symbol", "dimension", "schedule"]),
  source: z.object({
    documentId: z.string(),
    pageNumber: z.number(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    extractor: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  content: z.any(),
  metadata: z.record(z.string(), z.any()),
  timestamp: z.string(),
  version: z.string(),
});

export const AssumptionSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.any(),
  basis: z.enum(["irc_code", "user_override", "document_derived", "regional_default"]),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1),
  supersedes: z.string().optional(),
  timestamp: z.string(),
  expiresAt: z.string().optional(),
});

export const InferenceSchema = z.object({
  id: z.string(),
  topic: z.string(),
  value: z.any(),
  confidence: z.number().min(0).max(1),
  method: z.string(),
  usedEvidence: z.array(z.string()),
  usedAssumptions: z.array(z.string()),
  explanation: z.string(),
  alternatives: z.array(z.object({
    value: z.any(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })),
  timestamp: z.string(),
  stage: z.string(),
});

export const DecisionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  selectedValue: z.any(),
  selectedInferenceId: z.string(),
  competingInferences: z.array(z.string()),
  justification: z.string(),
  policyUsed: z.object({
    thresholds: z.record(z.string(), z.number()),
    tiebreakers: z.array(z.string()),
    appliedRules: z.array(z.string()),
  }),
  timestamp: z.string(),
  stage: z.string(),
});

export const FlagSchema = z.object({
  id: z.string(),
  type: z.enum(["CONFLICT", "MISSING_INFO", "LOW_CONFIDENCE", "POLICY_VIOLATION"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  message: z.string(),
  topic: z.string().optional(),
  evidenceIds: z.array(z.string()),
  assumptionIds: z.array(z.string()),
  inferenceIds: z.array(z.string()),
  decisionId: z.string().optional(),
  timestamp: z.string(),
  resolved: z.boolean(),
});

export const PolicySchema = z.object({
  id: z.string(),
  version: z.string(),
  thresholds: z.object({
    acceptInference: z.number().min(0).max(1),
    conflictGap: z.number().min(0).max(1),
    maxAmbiguity: z.number().min(0).max(1),
  }),
  priors: z.object({
    sourceReliability: z.record(z.string(), z.number().min(0).max(1)),
  }),
  tiebreakers: z.array(z.string()),
  extraction: z.object({
    maxVisionTokens: z.number(),
    maxPages: z.number(),
    enableGeometry: z.boolean(),
  }),
  pricing: z.object({
    minAccept: z.number().min(0).max(1),
    maxConcurrent: z.number(),
    retries: z.number(),
    timeoutMs: z.number(),
    jitterMs: z.number(),
    maxQuoteAgeDays: z.number(),
    currency: z.string(),
    fxRate: z.number().optional(),
    priceAsOf: z.string().optional(),
    vendorPrefs: z.array(z.string()).optional(),
  }),
});

export const InferenceLedgerSchema = z.object({
  id: z.string(),
  runId: z.string(),
  policyId: z.string(),
  evidence: z.array(EvidenceSchema),
  assumptions: z.array(AssumptionSchema),
  inferences: z.array(InferenceSchema),
  decisions: z.array(DecisionSchema),
  flags: z.array(FlagSchema),
  metadata: z.object({
    createdAt: z.string(),
    completedAt: z.string().optional(),
    totalStages: z.number(),
    successStages: z.number(),
  }),
});

export const PipeCtxSchema = z.object({
  ledger: InferenceLedgerSchema,
  policy: PolicySchema,
  stage: z.string(),
  stageData: z.record(z.string(), z.any()),
  metadata: z.object({
    traceId: z.string(),
    scenarioId: z.string().optional(),
    userId: z.string().optional(),
  }),
});
