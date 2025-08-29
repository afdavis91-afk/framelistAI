import { Policy } from './types';
import { Ledger } from './ledger';

// Use the simplified interface for integration
export interface SimplePipeCtx {
  policy: Policy;
  ledger: Ledger;
  scenarioId?: string;
  docId?: string;
}

export type MaybeCtx = SimplePipeCtx | undefined;

/**
 * Create context for pipeline execution
 */
export function createContext(
  policy: Policy,
  ledger: Ledger,
  options: { scenarioId?: string; docId?: string } = {}
): SimplePipeCtx {
  return {
    policy,
    ledger,
    scenarioId: options.scenarioId || 'default',
    docId: options.docId,
  };
}

/**
 * Helper functions for appending to ledger
 */
export function appendEvidence(ctx: MaybeCtx, evidence: Omit<import('./types').Evidence, 'id'>): string | undefined {
  if (!ctx?.ledger) return undefined;
  return ctx.ledger.appendEvidence(evidence);
}

export function appendInference(ctx: MaybeCtx, inference: Omit<import('./types').Inference<any>, 'id'>): string | undefined {
  if (!ctx?.ledger) return undefined;
  return ctx.ledger.appendInference(inference);
}

export function appendDecision(ctx: MaybeCtx, decision: Omit<import('./types').Decision<any>, 'id'>): string | undefined {
  if (!ctx?.ledger) return undefined;
  return ctx.ledger.appendDecision(decision);
}

export function appendFlag(ctx: MaybeCtx, flag: Omit<import('./types').Flag, 'id' | 'resolved'>): string | undefined {
  if (!ctx?.ledger) return undefined;
  return ctx.ledger.appendFlag(flag);
}
