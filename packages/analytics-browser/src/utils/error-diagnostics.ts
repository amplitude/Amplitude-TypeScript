/**
 * Error Diagnostics for Amplitude SDK
 *
 * Captures uncaught errors originating from SDK code using execution context tracking.
 * Integrates with the Diagnostics Client to report SDK errors for monitoring and debugging.
 */

import { getExecutionTracker, getGlobalScope, IDiagnosticsClient } from '@amplitude/analytics-core';

interface ErrorInfo {
  message: string;
  name: string;
  type: string;
  stack?: string;
  detection_method: 'execution_tracking';
  execution_context: string | null;
  error_location?: string;
  error_line?: number;
  error_column?: number;
}

// Track if error handlers are already setup to prevent duplicates
let isSetup = false;
let diagnosticsClient: IDiagnosticsClient | null = null;

/**
 * Setup global error tracking for Amplitude SDK errors.
 *
 * This sets up global error handlers (window.onerror and window.onunhandledrejection)
 * that work with execution context tracking to identify and report SDK errors.
 *
 * @param client - The diagnostics client to report errors to
 *
 * @example
 * ```typescript
 * // During SDK initialization
 * setupAmplitudeErrorTracking(diagnosticsClient);
 * ```
 */
export function setupAmplitudeErrorTracking(client: IDiagnosticsClient): void {
  // Prevent duplicate setup
  if (isSetup) {
    return;
  }

  diagnosticsClient = client;

  // Setup window.onerror handler
  setupWindowErrorHandler();

  // Setup unhandled rejection handler
  setupUnhandledRejectionHandler();

  isSetup = true;
}

/**
 * Setup window.onerror handler to catch synchronous errors
 */
function setupWindowErrorHandler(): void {
  const globalScope = getGlobalScope();
  if (!globalScope) {
    return;
  }

  // Store the original handler to call it after our handler
  const originalOnError = globalScope.onerror;

  globalScope.onerror = function (
    messageOrEvent: string | Event,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error,
  ): boolean | void {
    // Check if this error occurred during SDK execution
    const tracker = getExecutionTracker();
    const isInSDK = tracker.isInSDKExecution();
    const depth = tracker.getDepth();

    console.log('[ErrorTracking] window.onerror triggered:', {
      isInSDK,
      depth,
      context: tracker.getCurrentContext(),
      message: error?.message || messageOrEvent,
    });

    if (isInSDK) {
      // This is an SDK error - report it
      console.log('[ErrorTracking] ✅ SDK error detected! Reporting to diagnostics...');
      const errorInfo = buildErrorInfo(error, messageOrEvent, source, lineno, colno, tracker.getCurrentContext());
      reportSDKError(errorInfo);
    } else {
      console.log('[ErrorTracking] ❌ Not an SDK error (depth=0), ignoring');
    }

    // Call the original handler if it exists
    if (originalOnError && globalScope) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return originalOnError.call(globalScope, messageOrEvent, source, lineno, colno, error);
    }

    // Return false to allow default error handling
    return false;
  };
}

/**
 * Setup unhandledrejection handler to catch async errors
 */
function setupUnhandledRejectionHandler(): void {
  const globalScope = getGlobalScope();
  if (!globalScope) {
    return;
  }

  // Store the original handler
  const originalOnUnhandledRejection = globalScope.onunhandledrejection;

  globalScope.onunhandledrejection = function (event: PromiseRejectionEvent): void {
    // Check if this rejection occurred during SDK execution
    const tracker = getExecutionTracker();
    const isInSDK = tracker.isInSDKExecution();
    const depth = tracker.getDepth();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const reasonMessage = event.reason?.message || event.reason;
    console.log('[ErrorTracking] window.onunhandledrejection triggered:', {
      isInSDK,
      depth,
      context: tracker.getCurrentContext(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      reason: reasonMessage,
    });

    if (isInSDK) {
      // This is an SDK error - report it
      console.log('[ErrorTracking] ✅ SDK error detected! Reporting to diagnostics...');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const error = event.reason;
      const errorInfo = buildErrorInfo(error, undefined, undefined, undefined, undefined, tracker.getCurrentContext());
      reportSDKError(errorInfo);
    } else {
      console.log('[ErrorTracking] ❌ Not an SDK error (depth=0), ignoring');
    }

    // Call the original handler if it exists
    if (originalOnUnhandledRejection && globalScope) {
      originalOnUnhandledRejection.call(globalScope, event);
    }
  };
}

/**
 * Build error information object from error details
 */
function buildErrorInfo(
  error: Error | any,
  messageOrEvent?: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  executionContext?: string | null,
): ErrorInfo {
  const errorInfo: ErrorInfo = {
    message: '',
    name: 'Error',
    type: 'Error',
    detection_method: 'execution_tracking',
    execution_context: executionContext || null,
  };

  // Extract error details
  if (error && typeof error === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    errorInfo.message = error.message || String(error);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    errorInfo.name = error.name || 'Error';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    errorInfo.type = error.constructor?.name || error.name || 'Error';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (error.stack) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      errorInfo.stack = error.stack;
    }
  } else if (typeof messageOrEvent === 'string') {
    errorInfo.message = messageOrEvent;
  } else if (messageOrEvent) {
    errorInfo.message = String(messageOrEvent);
  }

  // Add location information if available
  if (source) {
    errorInfo.error_location = source;
  }
  if (lineno !== undefined) {
    errorInfo.error_line = lineno;
  }
  if (colno !== undefined) {
    errorInfo.error_column = colno;
  }

  return errorInfo;
}

/**
 * Report SDK error to diagnostics client
 */
function reportSDKError(errorInfo: ErrorInfo): void {
  console.log('[ErrorTracking] reportSDKError called:', errorInfo);

  if (!diagnosticsClient) {
    console.log('[ErrorTracking] ❌ No diagnosticsClient available!');
    return;
  }

  try {
    // Record the error event
    console.log('[ErrorTracking] Recording event to diagnostics...');
    diagnosticsClient.recordEvent('sdk.uncaught_error', errorInfo);

    // Increment error counter
    console.log('[ErrorTracking] Incrementing counter...');
    diagnosticsClient.increment('error.uncaught');

    console.log('[ErrorTracking] ✅ Error reported successfully!');
  } catch (e) {
    // Silently fail to prevent infinite error loops
    // In production, we don't want error reporting to cause more errors
    console.log('[ErrorTracking] ❌ Error reporting failed:', e);
  }
}

/**
 * Teardown error tracking (for testing purposes)
 * @internal
 */
export function _teardownAmplitudeErrorTracking(): void {
  isSetup = false;
  diagnosticsClient = null;

  // Note: We don't restore window.onerror and window.onunhandledrejection
  // because other code might be relying on them. This is acceptable since
  // the handlers will just no-op when diagnosticsClient is null.
}
