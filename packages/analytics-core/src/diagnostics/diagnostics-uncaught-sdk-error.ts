/**
 * Execution context tracker for Amplitude SDK
 * Tracks whether SDK code is currently executing to identify all errors
 */
class ExecutionContextTracker {
  private executionDepth = 0;
  private readonly contexts: Array<{ method: string; timestamp: number }> = [];

  /**
   * Mark that SDK code is executing
   */
  enter(context: string): void {
    this.executionDepth++;
    this.contexts.push({ method: context, timestamp: Date.now() });
  }

  /**
   * Mark that SDK code execution has finished
   */
  exit(): void {
    this.executionDepth--;
    this.contexts.pop();
    
    // Safety: ensure depth never goes negative
    if (this.executionDepth < 0) {
      this.executionDepth = 0;
    }
  }

  /**
   * Check if SDK code is currently executing
   */
  isExecuting(): boolean {
    return this.executionDepth > 0;
  }

  /**
   * Get current execution context
   */
  getCurrentContext(): { method: string; timestamp: number } | null {
    return this.contexts[this.contexts.length - 1] || null;
  }

  /**
   * Get full execution stack
   */
  getExecutionStack(): ReadonlyArray<{ method: string; timestamp: number }> {
    return [...this.contexts];
  }
}

// Global singleton tracker
const executionTracker = new ExecutionContextTracker();

/**
 * Get the global execution tracker
 */
export function getExecutionTracker(): ExecutionContextTracker {
  return executionTracker;
}

/**
 * Wrap a function to track its execution context
 * Any errors thrown during execution will be identifiable as SDK errors
 */
export function wrapWithErrorTracking<T extends (...args: any[]) => any>(
  fn: T,
  context: string,
): T {
  return ((...args: any[]) => {
    executionTracker.enter(context);
    try {
      const result = fn(...args);
      
      // Handle async functions
      if (result && typeof result.then === 'function') {
        return result
          .then((value: any) => {
            executionTracker.exit();
            return value;
          })
          .catch((error: any) => {
            executionTracker.exit();
            throw error;
          });
      }
      
      // Synchronous function
      executionTracker.exit();
      return result;
    } catch (error) {
      executionTracker.exit();
      throw error;
    }
  }) as T;
}
