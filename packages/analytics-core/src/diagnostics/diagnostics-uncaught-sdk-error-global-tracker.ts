/**
 * SDK Error Tracking via Error Tagging
 *
 * Identifies SDK-originated errors by tagging error objects thrown from SDK code.
 * Uses a WeakSet to tag errors, enabling detection by global error handlers
 * even after the original execution context has exited.
 *
 * Usage:
 * - Wrap SDK functions/callbacks with `diagnosticsUncaughtError(fn)`
 * - Global error handlers check `isPendingSDKError(error)` to identify SDK errors
 */

// Track error objects that originated from SDK code
// Using WeakSet prevents memory leaks as errors are garbage collected
const pendingSDKErrors = new WeakSet<Error>();

/**
 * Wraps a function to tag any thrown errors as SDK-originated.
 *
 * Use this to wrap SDK functions, methods, event listeners, or callbacks.
 * When the wrapped function throws an error (sync or async), the error is
 * tagged and re-thrown, allowing global error handlers to identify it as
 * an SDK error.
 *
 * @param fn - The function to wrap
 * @returns A wrapped function that tags errors before re-throwing
 *
 * @example
 * ```typescript
 * // Wrap a class method
 * class AmplitudeBrowser {
 *   track = diagnosticsUncaughtError(async (event: Event) => {
 *     // ... SDK tracking code ...
 *   });
 * }
 *
 * // Wrap an event listener callback
 * window.addEventListener('click', diagnosticsUncaughtError((event) => {
 *   // ... SDK code ...
 * }));
 *
 * // Wrap an observable subscription
 * observable.subscribe(diagnosticsUncaughtError((value) => {
 *   // ... SDK code ...
 * }));
 * ```
 */
export function diagnosticsUncaughtError<T extends (...args: any[]) => any>(fn: T): T {
  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = fn.apply(this, args);

      // If async, attach error handler to tag async errors
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (result && typeof result === 'object' && typeof result.then === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        return result.catch((error: unknown) => {
          if (error instanceof Error) {
            pendingSDKErrors.add(error);
          }
          throw error;
        }) as ReturnType<T>;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result;
    } catch (error) {
      // Tag synchronous errors as SDK-originated
      if (error instanceof Error) {
        pendingSDKErrors.add(error);
      }
      throw error;
    }
  } as T;
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
