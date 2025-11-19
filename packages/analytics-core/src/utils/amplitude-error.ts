/**
 * Execution Context Tracker for SDK Error Detection
 *
 * Tracks when SDK code is executing to identify which errors originate from SDK code.
 * Uses a simple counter-based approach: increment on entry, decrement on exit.
 * Any error during SDK execution (counter > 0) is an SDK error.
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
    console.log('[ErrorTracking] ENTER:', context, '| depth:', executionTracker.depth);
  },

  /**
   * Exit SDK execution context
   */
  exit(): void {
    console.log('[ErrorTracking] EXIT: depth before:', executionTracker.depth);
    executionTracker.depth = Math.max(0, executionTracker.depth - 1);
    if (executionTracker.depth === 0) {
      executionTracker.currentContext = null;
    }
    console.log('[ErrorTracking] EXIT: depth after:', executionTracker.depth);
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
 * Wraps a function with execution tracking to identify SDK errors.
 *
 * This wrapper tracks when SDK code is running using a simple counter.
 * Any error that occurs while the counter > 0 is identified as an SDK error
 * by the global error handlers.
 *
 * @param fn - The function to wrap
 * @param context - Name of the function/context (e.g., 'AmplitudeBrowser.track')
 * @returns Wrapped function with error tracking
 *
 * @example
 * ```typescript
 * // Wrap synchronous function
 * const trackedInit = wrapWithErrorTracking(() => {
 *   // ... SDK initialization code ...
 * }, 'AmplitudeBrowser.init');
 *
 * // Wrap async function
 * const trackedProcess = wrapWithErrorTracking(async () => {
 *   // ... SDK processing code ...
 * }, 'AmplitudeBrowser.process');
 * ```
 */
export function wrapWithErrorTracking<T extends (...args: any[]) => any>(
  fn: T,
  context: string,
): (...args: Parameters<T>) => ReturnType<T> {
  const tracker = getExecutionTracker();

  // Handle both sync and async functions
  return function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    tracker.enter(context);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = fn.apply(this, args);

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
            // DON'T exit on error - keep tracker active so global handlers can detect it
            // The exit will happen after a longer delay to allow error handlers to run
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log('[ErrorTracking] Promise CATCH - depth:', tracker.getDepth(), '| error:', errorMessage);
            console.log('[ErrorTracking] NOT exiting - keeping depth active for error detection');

            // Schedule exit after error handlers have had time to run (100ms should be safe)
            setTimeout(() => {
              console.log('[ErrorTracking] Delayed EXIT after error - depth before:', tracker.getDepth());
              tracker.exit();
            }, 100);

            throw error;
          }) as ReturnType<T>;
      }

      // Synchronous function - exit immediately
      tracker.exit();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result;
    } catch (error) {
      // Exit tracking before re-throwing
      tracker.exit();
      throw error;
    }
  };
}
