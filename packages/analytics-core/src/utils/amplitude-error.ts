/**
 * Execution context tracker for Amplitude SDK
 * Tracks whether we're currently executing SDK code to identify all errors (not just AmplitudeError)
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
 * Unique symbol to mark errors that originate from Amplitude SDK
 * This symbol cannot be created by external code, making it a reliable marker
 */
const AMPLITUDE_ERROR_MARKER = Symbol('__AMPLITUDE_SDK_ERROR__');

/**
 * Custom error class for Amplitude SDK
 * Use this for intentionally thrown errors with context
 */
export class AmplitudeError extends Error {
  [AMPLITUDE_ERROR_MARKER] = true;
  
  constructor(message: string, public readonly context?: Record<string, any>) {
    super(message);
    this.name = 'AmplitudeError';
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AmplitudeError);
    }
  }
  
  /**
   * Check if an error is marked as an AmplitudeError
   */
  static isAmplitudeError(error: any): error is AmplitudeError {
    return error && error[AMPLITUDE_ERROR_MARKER] === true;
  }
}

/**
 * Mark any error as originating from Amplitude SDK
 * This is used by the error handler to mark errors that occurred during SDK execution
 */
export function markAsAmplitudeError(error: Error, context?: Record<string, any>): Error {
  (error as any)[AMPLITUDE_ERROR_MARKER] = true;
  if (context) {
    (error as any).amplitudeContext = context;
  }
  return error;
}

/**
 * Check if an error originated from Amplitude SDK (either thrown or occurred during execution)
 */
export function isAmplitudeOriginatedError(error: any): boolean {
  return error && error[AMPLITUDE_ERROR_MARKER] === true;
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
            // Mark error as Amplitude-originated before rethrowing
            markAsAmplitudeError(error, {
              sdkContext: context,
              executionStack: executionTracker.getExecutionStack(),
            });
            throw error;
          });
      }
      
      // Synchronous function
      executionTracker.exit();
      return result;
    } catch (error) {
      executionTracker.exit();
      // Mark error as Amplitude-originated before rethrowing
      markAsAmplitudeError(error as Error, {
        sdkContext: context,
        executionStack: executionTracker.getExecutionStack(),
      });
      throw error;
    }
  }) as T;
}

/**
 * Decorator to wrap class methods with error tracking
 * Usage: @trackErrors('ClassName.methodName')
 */
export function trackErrors(context: string) {
  return function (
    _target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    
    descriptor.value = function (this: any, ...args: any[]) {
      executionTracker.enter(`${context}.${propertyKey}`);
      try {
        const result = originalMethod.apply(this, args);
        
        // Handle async methods
        if (result && typeof result.then === 'function') {
          return result
            .then((value: any) => {
              executionTracker.exit();
              return value;
            })
            .catch((error: any) => {
              executionTracker.exit();
              markAsAmplitudeError(error, {
                sdkContext: `${context}.${propertyKey}`,
                executionStack: executionTracker.getExecutionStack(),
              });
              throw error;
            });
        }
        
        executionTracker.exit();
        return result;
      } catch (error) {
        executionTracker.exit();
        markAsAmplitudeError(error as Error, {
          sdkContext: `${context}.${propertyKey}`,
          executionStack: executionTracker.getExecutionStack(),
        });
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Extract the file name from a stack trace line
 * Works with both original and minified code
 */
function extractFileNameFromStackLine(line: string): string | null {
  // Match patterns like:
  // at functionName (http://example.com/path/file.js:10:5)
  // at http://example.com/path/file.js:10:5
  const match = line.match(/(?:https?:\/\/[^/]+)?\/([^:)]+\.js)(?::\d+:\d+)?/);
  return match ? match[1] : null;
}

/**
 * Analyze stack trace to detect if error originated from SDK files
 * This is a fallback for cases where execution tracking didn't catch the error
 */
export function analyzeStackTrace(error: Error): {
  isLikelyAmplitudeError: boolean;
  matchedFiles: string[];
} {
  if (!error.stack) {
    return { isLikelyAmplitudeError: false, matchedFiles: [] };
  }

  const stackLines = error.stack.split('\n');
  const matchedFiles: string[] = [];

  // Patterns that indicate Amplitude SDK files
  // Even in minified code, the file names often contain identifiable patterns
  const amplitudePatterns = [
    /amplitude.*\.js/i,
    /analytics.*browser.*\.js/i,
    /analytics.*core.*\.js/i,
    /amplitude-sdk.*\.js/i,
    /@amplitude\//i,
  ];

  for (const line of stackLines) {
    const fileName = extractFileNameFromStackLine(line);
    if (!fileName) continue;

    for (const pattern of amplitudePatterns) {
      if (pattern.test(fileName) || pattern.test(line)) {
        matchedFiles.push(fileName);
        break;
      }
    }
  }

  return {
    isLikelyAmplitudeError: matchedFiles.length > 0,
    matchedFiles,
  };
}
