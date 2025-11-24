/**
 * Execution Context Tracker for SDK Error Detection
 *
 * Tracks when SDK code is executing to identify which errors originate from SDK code.
 * Uses a simple counter-based approach: increment on entry, decrement on exit.
 * Any error during SDK execution (counter > 0) is an SDK error.
 *
 * Additionally tracks error objects themselves using WeakSet for precise error attribution,
 * especially useful for async errors that may be reported after the execution context exits.
 */

interface ExecutionContext {
  depth: number;
  currentContext: string | null;
}

// Global execution tracker
const executionTracker: ExecutionContext = {
  depth: 0,
  currentContext: null,
};

// Track error objects that originated from SDK code
// Using WeakSet prevents memory leaks as errors are garbage collected
const pendingSDKErrors = new WeakSet<Error>();

/**
 * Get the global execution tracker instance
 */
export const getExecutionTracker = () => ({
  /**
   * Enter SDK execution context
   * @param context - Name of the SDK function being executed (e.g., 'AmplitudeBrowser.track')
   */
  enter(context: string): void {
    executionTracker.depth++;
    executionTracker.currentContext = context;
  },

  /**
   * Exit SDK execution context
   */
  exit(): void {
    executionTracker.depth = Math.max(0, executionTracker.depth - 1);
    if (executionTracker.depth === 0) {
      executionTracker.currentContext = null;
    }
  },

  /**
   * Check if currently executing SDK code
   */
  isInSDKExecution(): boolean {
    return executionTracker.depth > 0;
  },

  /**
   * Get the current execution context name
   */
  getCurrentContext(): string | null {
    return executionTracker.currentContext;
  },

  /**
   * Get current depth (for debugging)
   */
  getDepth(): number {
    return executionTracker.depth;
  },
});

/**
 * Method decorator that wraps a class method with execution tracking to identify SDK errors.
 *
 * This decorator tracks when SDK code is running using a simple counter.
 * Any error that occurs while the counter > 0 is identified as an SDK error
 * by the global error handlers.
 *
 * @param context - Name of the function/context (e.g., 'AmplitudeBrowser.track')
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class AmplitudeBrowser {
 *   @TrackSDKErrors('AmplitudeBrowser.init')
 *   async init(apiKey: string) {
 *     // ... SDK initialization code ...
 *   }
 *
 *   @TrackSDKErrors('AmplitudeBrowser.track')
 *   async track(event: Event) {
 *     // ... SDK tracking code ...
 *   }
 * }
 * ```
 */
export function TrackSDKErrors(context: string) {
  return function <T extends (...args: any[]) => any>(
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as T;
    const tracker = getExecutionTracker();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    descriptor.value = function (this: any, ...args: Parameters<T>): ReturnType<T> {
      tracker.enter(context);

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = originalMethod.apply(this, args);

        // If result is a Promise, track async execution
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (result && typeof result === 'object' && typeof result.then === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          return result
            .then((value: unknown) => {
              tracker.exit();
              return value;
            })
            .catch((error: unknown) => {
              // Tag this error as SDK-originated for later detection
              if (error instanceof Error) {
                pendingSDKErrors.add(error);
              }

              tracker.exit();
              throw error;
            }) as ReturnType<T>;
        }

        // Synchronous function - exit immediately
        tracker.exit();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return result;
      } catch (error) {
        // Tag synchronous errors as SDK-originated
        if (error instanceof Error) {
          pendingSDKErrors.add(error);
        }

        // Exit tracking before re-throwing
        tracker.exit();
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Check if an error object was tagged as SDK-originated.
 * This is useful for detecting SDK errors in global error handlers,
 * even after the execution context has exited.
 *
 * @param error - The error to check
 * @returns true if the error originated from SDK code
 */
export function isPendingSDKError(error: unknown): boolean {
  return error instanceof Error && pendingSDKErrors.has(error);
}

/**
 * Clear the SDK error tag from an error object.
 * Should be called after reporting the error to prevent memory leaks
 * (though WeakSet already handles this automatically).
 *
 * @param error - The error to clear
 */
export function clearPendingSDKError(error: unknown): void {
  if (error instanceof Error) {
    pendingSDKErrors.delete(error);
  }
}
