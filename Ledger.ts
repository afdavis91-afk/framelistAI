export type LedgerEntryType = "ASSUMPTION" | "INFERENCE" | "DECISION";

export interface LedgerEntry {
  id: string;
  timestamp: string;
  type: LedgerEntryType;
  specKeyStable: string;
  message: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface PricingLedger {
  entries: LedgerEntry[];
  addEntry: (entry: Omit<LedgerEntry, "id" | "timestamp">) => void;
  getEntriesForSpec: (specKeyStable: string) => LedgerEntry[];
  clear: () => void;
}

export function createLedgerEntry(
  type: LedgerEntryType,
  specKeyStable: string,
  message: string,
  data?: Record<string, any>,
  metadata?: Record<string, any>
): LedgerEntry {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    type,
    specKeyStable,
    message,
    data,
    metadata
  };
}
