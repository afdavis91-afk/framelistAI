import { InferenceLedger } from './InferenceLedger';

/**
 * Storage key for ledger data
 */
export function getLedgerStorageKey(docId: string, runId: string): string {
  return `ledger:${docId}:${runId}`;
}

/**
 * Save ledger to storage
 */
export async function saveLedger(ledger: InferenceLedger, docId: string, runId: string): Promise<void> {
  try {
    const key = getLedgerStorageKey(docId, runId);
    const data = ledger.toJSON();
    
    // Use AsyncStorage or similar storage mechanism
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(data));
    } else if (typeof AsyncStorage !== 'undefined') {
      // For React Native
      const { AsyncStorage } = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } else {
      // Fallback to console for debugging
      console.log(`[Ledger Storage] Would save to key: ${key}`, data);
    }
  } catch (error) {
    console.warn('Failed to save ledger:', error);
  }
}

/**
 * Load ledger from storage
 */
export async function loadLedger(docId: string, runId: string): Promise<InferenceLedger | null> {
  try {
    const key = getLedgerStorageKey(docId, runId);
    let data: string | null = null;
    
    // Use AsyncStorage or similar storage mechanism
    if (typeof localStorage !== 'undefined') {
      data = localStorage.getItem(key);
    } else if (typeof AsyncStorage !== 'undefined') {
      // For React Native
      const { AsyncStorage } = await import('@react-native-async-storage/async-storage');
      data = await AsyncStorage.getItem(key);
    } else {
      // Fallback to console for debugging
      console.log(`[Ledger Storage] Would load from key: ${key}`);
      return null;
    }
    
    if (data) {
      const ledgerData = JSON.parse(data);
      const ledger = new InferenceLedger(ledgerData.runId, ledgerData.policyId);
      
      // Restore ledger state
      ledgerData.evidence.forEach((ev: any) => ledger.addEvidence(ev));
      ledgerData.assumptions.forEach((ass: any) => ledger.addAssumption(ass));
      ledgerData.inferences.forEach((inf: any) => ledger.addInference(inf));
      ledgerData.decisions.forEach((dec: any) => ledger.addDecision(dec));
      ledgerData.flags.forEach((flag: any) => ledger.addFlag(flag));
      
      return ledger;
    }
  } catch (error) {
    console.warn('Failed to load ledger:', error);
  }
  
  return null;
}

/**
 * Delete ledger from storage
 */
export async function deleteLedger(docId: string, runId: string): Promise<void> {
  try {
    const key = getLedgerStorageKey(docId, runId);
    
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    } else if (typeof AsyncStorage !== 'undefined') {
      // For React Native
      const { AsyncStorage } = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.removeItem(key);
    } else {
      // Fallback to console for debugging
      console.log(`[Ledger Storage] Would delete key: ${key}`);
    }
  } catch (error) {
    console.warn('Failed to delete ledger:', error);
  }
}

/**
 * List all ledger keys for a document
 */
export async function listLedgerKeys(docId: string): Promise<string[]> {
  try {
    const keys: string[] = [];
    
    if (typeof localStorage !== 'undefined') {
      // For web, we can't easily list all keys, so return empty
      return [];
    } else if (typeof AsyncStorage !== 'undefined') {
      // For React Native
      const { AsyncStorage } = await import('@react-native-async-storage/async-storage');
      const allKeys = await AsyncStorage.getAllKeys();
      return allKeys.filter(key => key.startsWith(`ledger:${docId}:`));
    } else {
      return [];
    }
  } catch (error) {
    console.warn('Failed to list ledger keys:', error);
    return [];
  }
}
