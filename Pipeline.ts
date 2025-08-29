import { Stage, PipeCtx, InferenceLedger, Policy } from './types';
import { policyManager } from './PolicyManager';

export interface PipelineResult<T> {
  output: T;
  ledger: InferenceLedger;
  success: boolean;
  errors: string[];
  executionTime: number;
}

export interface PipelineConfig {
  policyId?: string;
  scenarioId?: string;
  userId?: string;
  enableFeatureFlags?: Record<string, boolean>;
  maxRetries?: number;
  timeoutMs?: number;
}

export class Pipeline<I, O> {
  private stages: Stage<any, any>[] = [];
  private config: PipelineConfig;

  constructor(config: PipelineConfig = {}) {
    this.config = {
      policyId: 'default',
      maxRetries: 3,
      timeoutMs: 300000, // 5 minutes
      ...config,
    };
  }

  /**
   * Add a stage to the pipeline
   */
  addStage<T, U>(stage: Stage<T, U>): Pipeline<I, O> {
    this.stages.push(stage);
    return this;
  }

  /**
   * Execute the pipeline with the given input
   */
  async execute(input: I, onProgress?: (progress: number) => void): Promise<PipelineResult<O>> {
    const startTime = Date.now();
    const errors: string[] = [];
    
    try {
      // Initialize pipeline context
      const policy = policyManager.getPolicy(this.config.policyId!);
      const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      
      const ledger = new InferenceLedger(runId, policy.id);
      const ctx = new PipeCtx(ledger, policy, 'Pipeline', traceId);
      
      // Set metadata
      if (this.config.scenarioId) {
        ctx.setScenarioId(this.config.scenarioId);
      }
      if (this.config.userId) {
        ctx.setUserId(this.config.userId);
      }
      
      // Override feature flags if specified
      if (this.config.enableFeatureFlags) {
        for (const [flag, enabled] of Object.entries(this.config.enableFeatureFlags)) {
          process.env[`FEATURE_${flag.toUpperCase()}`] = enabled ? 'true' : 'false';
        }
      }

      // Initialize progress tracking
      const totalStages = this.stages.length;
      let currentStage = 0;
      
      // Execute stages sequentially
      let currentInput: any = input;
      
      for (const stage of this.stages) {
        try {
          ctx.logStageEntry(stage.name);
          
          // Update stage progress
          ctx.updateStageProgress(totalStages, currentStage);
          
          // Execute stage
          const stageOutput = await this.executeStageWithRetry(stage, currentInput, ctx);
          
          // Validate stage output if validation method exists
          if (stage.validateOutput && !stage.validateOutput(stageOutput)) {
            throw new Error(`Stage ${stage.name} output validation failed`);
          }
          
          // Update progress
          currentStage++;
          currentInput = stageOutput;
          
          // Report progress
          const progress = (currentStage / totalStages) * 100;
          onProgress?.(progress);
          
          ctx.logStageExit(stage.name, true);
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Stage ${stage.name} failed: ${errorMessage}`);
          
          ctx.logStageExit(stage.name, false);
          
          // Add error flag to ledger
          ctx.ledger.addFlag({
            id: `flag_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            type: 'POLICY_VIOLATION',
            severity: 'high',
            message: `Pipeline stage ${stage.name} failed: ${errorMessage}`,
            topic: stage.name,
            evidenceIds: [],
            assumptionIds: [],
            inferenceIds: [],
            timestamp: new Date().toISOString(),
            resolved: false,
          });
          
          // Continue with next stage if possible, but mark as failed
          console.error(`Stage ${stage.name} failed, continuing with next stage`);
        }
      }
      
      // Mark pipeline as completed
      ledger.markCompleted();
      
      const executionTime = Date.now() - startTime;
      
      return {
        output: currentInput as O,
        ledger,
        success: errors.length === 0,
        errors,
        executionTime,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Pipeline execution failed: ${errorMessage}`);
      
      const executionTime = Date.now() - startTime;
      
      return {
        output: input as unknown as O,
        ledger: new InferenceLedger('failed', 'unknown'),
        success: false,
        errors,
        executionTime,
      };
    }
  }

  /**
   * Execute a single stage with retry logic
   */
  private async executeStageWithRetry<T, U>(
    stage: Stage<T, U>, 
    input: T, 
    ctx: PipeCtx
  ): Promise<U> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        // Validate input if validation method exists
        if (stage.validateInput && !stage.validateInput(input)) {
          throw new Error(`Stage ${stage.name} input validation failed`);
        }
        
        // Execute stage with timeout
        const stagePromise = stage.execute(input, ctx);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Stage ${stage.name} timed out after ${this.config.timeoutMs}ms`)), this.config.timeoutMs);
        });
        
        return await Promise.race([stagePromise, timeoutPromise]);
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.maxRetries!) {
          console.warn(`Stage ${stage.name} attempt ${attempt} failed, retrying...`, lastError.message);
          
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
        } else {
          console.error(`Stage ${stage.name} failed after ${this.config.maxRetries} attempts:`, lastError.message);
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error(`Stage ${stage.name} failed after ${this.config.maxRetries} attempts`);
  }

  /**
   * Get pipeline configuration
   */
  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  /**
   * Update pipeline configuration
   */
  updateConfig(updates: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get stage information
   */
  getStages(): Array<{ name: string; index: number }> {
    return this.stages.map((stage, index) => ({
      name: stage.name,
      index,
    }));
  }

  /**
   * Clear all stages
   */
  clearStages(): void {
    this.stages = [];
  }

  /**
   * Create a copy of the pipeline with the same configuration
   */
  clone(): Pipeline<I, O> {
    const cloned = new Pipeline<I, O>(this.config);
    for (const stage of this.stages) {
      cloned.addStage(stage);
    }
    return cloned;
  }
}
