import { Policy } from './types';
import { policyManager } from './PolicyManager';

export interface PolicyLoadOptions {
  projectOverrides?: Partial<Policy>;
  policyId?: string;
  scenarioId?: string;
}

/**
 * Load policy with optional project overrides
 */
export function loadPolicy(options: PolicyLoadOptions = {}): Policy {
  const { projectOverrides, policyId = 'default', scenarioId } = options;
  
  // Get base policy
  const basePolicy = policyManager.getPolicy(policyId);
  
  // If no project overrides, return base policy
  if (!projectOverrides) {
    return basePolicy;
  }
  
  // Create custom policy with overrides
  return policyManager.createCustomPolicy({
    ...basePolicy,
    ...projectOverrides,
    id: projectOverrides.id || `${basePolicy.id}_${scenarioId || 'custom'}`,
  });
}

/**
 * Load default policy
 */
export function loadDefaultPolicy(): Policy {
  return policyManager.getPolicy('default');
}

/**
 * Load policy from settings (for pricing integration)
 */
export function policyFromSettings(settings: any): Partial<Policy> {
  const pricingOverrides: Partial<Policy['pricing']> = {};
  
  // Extract pricing-related settings
  if (settings.pricing) {
    if (settings.pricing.currency) pricingOverrides.currency = settings.pricing.currency;
    if (settings.pricing.maxConcurrent) pricingOverrides.maxConcurrent = settings.pricing.maxConcurrent;
    if (settings.pricing.retries) pricingOverrides.retries = settings.pricing.retries;
    if (settings.pricing.timeoutMs) pricingOverrides.timeoutMs = settings.pricing.timeoutMs;
  }
  
  return {
    pricing: pricingOverrides,
  };
}
