import { wrapWithErrorTracking } from '../diagnostics/diagnostics-uncaught-sdk-error';

/**
 * Utility functions to safely execute code with error tracking
 * These helpers make it easy to wrap existing functions without modifying their implementation
 */

/**
 * Safely execute a function with automatic error tracking
 * Errors will be tracked but not thrown (returns undefined on error)
 * 
 * @example
 * ```typescript
 * const result = safeExecute(() => riskyOperation(), 'MyComponent.riskyOperation');
 * ```
 */
export function safeExecute<T>(
  fn: () => T,
  context: string,
  onError?: (error: Error) => void,
): T | undefined {
  const wrapped = wrapWithErrorTracking(fn, context);
  try {
    return wrapped();
  } catch (error) {
    if (onError) {
      onError(error as Error);
    }
    return undefined;
  }
}

/**
 * Safely execute an async function with automatic error tracking
 * Errors will be tracked but not thrown (returns undefined on error)
 * 
 * @example
 * ```typescript
 * const result = await safeExecuteAsync(async () => await fetchData(), 'DataLoader.fetchData');
 * ```
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  context: string,
  onError?: (error: Error) => void,
): Promise<T | undefined> {
  const wrapped = wrapWithErrorTracking(fn, context);
  try {
    return await wrapped();
  } catch (error) {
    if (onError) {
      onError(error as Error);
    }
    return undefined;
  }
}

/**
 * Wrap all methods of an object/class with error tracking
 * Useful for wrapping plugin instances or service objects
 * 
 * @example
 * ```typescript
 * class MyPlugin {
 *   setup() { ... }
 *   execute() { ... }
 * }
 * 
 * const plugin = wrapObjectMethods(new MyPlugin(), 'MyPlugin');
 * ```
 */
export function wrapObjectMethods<T extends Record<string, any>>(
  obj: T,
  contextPrefix: string,
  methodNames?: string[],
): T {
  const methods = methodNames || Object.getOwnPropertyNames(Object.getPrototypeOf(obj));

  for (const key of methods) {
    // Skip constructor and non-function properties
    if (key === 'constructor' || typeof obj[key] !== 'function') {
      continue;
    }

    const originalMethod = obj[key] as Function;
    (obj as any)[key] = wrapWithErrorTracking(
      originalMethod.bind(obj),
      `${contextPrefix}.${key}`,
    );
  }

  return obj;
}

/**
 * Create a wrapped version of a callback that tracks errors
 * Useful for event handlers and callbacks passed to external code
 * 
 * @example
 * ```typescript
 * element.addEventListener('click', wrapCallback((event) => {
 *   // Your code here
 * }, 'ClickHandler'));
 * ```
 */
export function wrapCallback<TArgs extends any[], TReturn>(
  callback: (...args: TArgs) => TReturn,
  context: string,
): (...args: TArgs) => TReturn {
  return wrapWithErrorTracking(callback, context);
}
