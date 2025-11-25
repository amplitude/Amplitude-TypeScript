/**
 * Execution Context Tracker for SDK Error Detection
 *
 * Identifies SDK-originated errors using two complementary mechanisms:
 *
 * 1. Execution depth counter: Tracks active SDK execution (increment on entry, decrement on exit).
 *    Errors occurring while counter > 0 are identified as SDK errors.
 *
 * 2. Error tagging with WeakSet: Tags error objects thrown from SDK code.
 *    Enables detection of async errors that surface after the execution context has exited.
 *
 * Global error handlers check both mechanisms to accurately identify SDK errors.
 */

interface ExecutionContext {
  depth: number;
}

// Global execution tracker
const executionTracker: ExecutionContext = {
  depth: 0,
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
   */
  enter(): void {
    executionTracker.depth++;
  },

  /**
   * Exit SDK execution context
   */
  exit(): void {
    executionTracker.depth = Math.max(0, executionTracker.depth - 1);
  },

  /**
   * Check if currently executing SDK code
   */
  isInSDKExecution(): boolean {
    return executionTracker.depth > 0;
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
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class AmplitudeBrowser {
 *   @DiagnosticsUncaughtError
 *   async track(event: Event) {
 *     // ... SDK tracking code ...
 *   }
 * }
 * ```
 */
export function DiagnosticsUncaughtError<T extends (...args: any[]) => any>(
  _target: any,
  _propertyKey: string,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const originalMethod = descriptor.value as T;
  const tracker = getExecutionTracker();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  descriptor.value = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    tracker.enter();

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = originalMethod.apply(this, args);
      tracker.exit();

      // If async, attach error handler to tag async errors
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (result && typeof result === 'object' && typeof result.then === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        return result.catch((error: unknown) => {
          // Tag this error as SDK-originated for later detection
          if (error instanceof Error) {
            pendingSDKErrors.add(error);
          }
          throw error;
        }) as ReturnType<T>;
      }

      // If sync, return the result immediately
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
