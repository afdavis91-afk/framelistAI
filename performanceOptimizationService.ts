import * as FileSystem from "expo-file-system";

interface CacheEntry {
  data: any;
  timestamp: number;
  size: number;
  accessCount: number;
  lastAccessed: number;
}

interface PerformanceMetrics {
  processingTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  apiCallCount: number;
  errorRate: number;
}

interface OptimizationOptions {
  enableCaching: boolean;
  maxCacheSize: number; // MB
  cacheExpiryTime: number; // milliseconds
  enableBatching: boolean;
  batchSize: number;
  enableCompression: boolean;
  maxRetries: number;
  enablePreprocessing: boolean;
}

export class PerformanceOptimizationService {
  private cache: Map<string, CacheEntry> = new Map();
  private metrics: PerformanceMetrics = {
    processingTime: 0,
    memoryUsage: 0,
    cacheHitRate: 0,
    apiCallCount: 0,
    errorRate: 0
  };
  
  private readonly defaultOptions: OptimizationOptions = {
    enableCaching: true,
    maxCacheSize: 50, // 50MB
    cacheExpiryTime: 24 * 60 * 60 * 1000, // 24 hours
    enableBatching: true,
    batchSize: 5,
    enableCompression: true,
    maxRetries: 3,
    enablePreprocessing: true
  };

  constructor(private options: Partial<OptimizationOptions> = {}) {
    this.options = { ...this.defaultOptions, ...options };
    this.initializeCache();
  }

  /**
   * Initialize cache and cleanup old entries
   */
  private async initializeCache(): Promise<void> {
    try {
      // Load persistent cache from storage
      const cacheFile = `${FileSystem.documentDirectory}processing_cache.json`;
      const cacheExists = await FileSystem.getInfoAsync(cacheFile);
      
      if (cacheExists.exists) {
        const cacheData = await FileSystem.readAsStringAsync(cacheFile);
        const persistentCache = JSON.parse(cacheData);
        
        // Restore cache entries that haven't expired
        const now = Date.now();
        const expiryTime = this.options.cacheExpiryTime || this.defaultOptions.cacheExpiryTime;
        Object.entries(persistentCache).forEach(([key, entry]: [string, any]) => {
          if (now - entry.timestamp < expiryTime) {
            this.cache.set(key, entry);
          }
        });
      }
      
      // Schedule periodic cache cleanup
      this.scheduleCleanup();
    } catch (error) {
      console.warn("[Performance] Failed to initialize cache:", error);
    }
  }

  /**
   * Get cached result if available
   */
  async getCachedResult<T>(key: string): Promise<T | null> {
    if (!this.options.enableCaching) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const expiryTime = this.options.cacheExpiryTime || this.defaultOptions.cacheExpiryTime;
    
    // Check if entry has expired
    if (now - entry.timestamp > expiryTime) {
      this.cache.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;
    
    return entry.data as T;
  }

  /**
   * Cache processing result
   */
  async setCachedResult<T>(key: string, data: T): Promise<void> {
    if (!this.options.enableCaching) return;

    const now = Date.now();
    const dataSize = this.estimateDataSize(data);
    
    // Check cache size limits
    await this.ensureCacheSpace(dataSize);
    
    const entry: CacheEntry = {
      data,
      timestamp: now,
      size: dataSize,
      accessCount: 1,
      lastAccessed: now
    };
    
    this.cache.set(key, entry);
    
    // Persist cache periodically
    if (this.cache.size % 10 === 0) {
      await this.persistCache();
    }
  }

  /**
   * Generate cache key for document processing
   */
  generateCacheKey(documentUri: string, options: any): string {
    const optionsHash = this.hashObject(options);
    const documentHash = this.hashString(documentUri);
    return `doc_${documentHash}_${optionsHash}`;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const totalCacheRequests = this.metrics.apiCallCount;
    const cacheHits = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0);
    
    return {
      ...this.metrics,
      cacheHitRate: totalCacheRequests > 0 ? (cacheHits / totalCacheRequests) * 100 : 0
    };
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    
    try {
      const cacheFile = `${FileSystem.documentDirectory}processing_cache.json`;
      await FileSystem.deleteAsync(cacheFile, { idempotent: true });
    } catch (error) {
      console.warn("[Performance] Failed to clear persistent cache:", error);
    }
  }

  // Private helper methods
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private estimateDataSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Rough estimate in bytes
    } catch {
      return 1024; // Default size if estimation fails
    }
  }

  private async ensureCacheSpace(requiredSize: number): Promise<void> {
    const currentSize = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
    
    const maxCacheSize = this.options.maxCacheSize || this.defaultOptions.maxCacheSize;
    const maxSizeBytes = maxCacheSize * 1024 * 1024;
    
    if (currentSize + requiredSize > maxSizeBytes) {
      await this.cleanupCache();
    }
  }

  private async cleanupCache(): Promise<void> {
    // Remove expired entries first
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    const expiryTime = this.options.cacheExpiryTime || this.defaultOptions.cacheExpiryTime;
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > expiryTime) {
        expiredKeys.push(key);
      }
    });
    
    expiredKeys.forEach(key => this.cache.delete(key));
    
    // If still over limit, remove least recently used entries
    const currentSize = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
    
    const maxCacheSize = this.options.maxCacheSize || this.defaultOptions.maxCacheSize;
    const maxSizeBytes = maxCacheSize * 1024 * 1024;
    
    if (currentSize > maxSizeBytes) {
      const entries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
      
      let removedSize = 0;
      const targetRemoval = currentSize - (maxSizeBytes * 0.7); // Remove to 70% capacity
      
      for (const [key, entry] of entries) {
        this.cache.delete(key);
        removedSize += entry.size;
        
        if (removedSize >= targetRemoval) break;
      }
    }
  }

  private async persistCache(): Promise<void> {
    try {
      const cacheFile = `${FileSystem.documentDirectory}processing_cache.json`;
      const cacheData = Object.fromEntries(this.cache.entries());
      
      await FileSystem.writeAsStringAsync(cacheFile, JSON.stringify(cacheData), {
        encoding: FileSystem.EncodingType.UTF8
      });
    } catch (error) {
      console.warn("[Performance] Failed to persist cache:", error);
    }
  }

  private scheduleCleanup(): void {
    // Schedule cleanup every hour
    setInterval(() => {
      this.cleanupCache().catch(error => {
        console.warn("[Performance] Scheduled cleanup failed:", error);
      });
    }, 60 * 60 * 1000);
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private hashObject(obj: any): string {
    return this.hashString(JSON.stringify(obj));
  }
}

export const performanceOptimizationService = new PerformanceOptimizationService();