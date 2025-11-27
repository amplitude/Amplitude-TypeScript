/**
 * Error Diagnostics for Amplitude SDK
 *
 * Captures uncaught errors originating from SDK code using execution context tracking.
 * Integrates with the Diagnostics Client to report SDK errors for monitoring and debugging.
 */

import { isPendingSDKError, clearPendingSDKError } from './diagnostics-uncaught-sdk-error-global-tracker';
import { getGlobalScope } from '../global-scope';
import { IDiagnosticsClient } from './diagnostics-client';

interface ErrorInfo {
  message: string;
  name: string;
  stack?: string;
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
 * This sets up global error event listeners that work with execution context
 * tracking to identify and report SDK errors.
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
  if (isSetup) {
    return;
  }

  diagnosticsClient = client;

  setupWindowErrorHandler();
  setupUnhandledRejectionHandler();

  isSetup = true;
}

/**
 * Setup window error event listener to catch synchronous errors
 */
function setupWindowErrorHandler(): void {
  const globalScope = getGlobalScope();
  if (!globalScope) {
    return;
  }

  globalScope.addEventListener('error', (event: ErrorEvent) => {
    if (isPendingSDKError(event.error)) {
      const errorInfo = buildErrorInfo(event.error, event.message, event.filename, event.lineno, event.colno);
      reportSDKError(errorInfo);
      clearPendingSDKError(event.error);
    }
  });
}

/**
 * Setup unhandledrejection event listener to catch async errors
 */
function setupUnhandledRejectionHandler(): void {
  const globalScope = getGlobalScope();
  if (!globalScope) {
    return;
  }

  globalScope.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (isPendingSDKError(event.reason)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const error = event.reason;
      const errorInfo = buildErrorInfo(error);
      reportSDKError(errorInfo);
      clearPendingSDKError(error);
    }
  });
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
): ErrorInfo {
  const errorInfo: ErrorInfo = {
    message: '',
    name: 'Error',
  };

  // Extract error details
  /* istanbul ignore next*/
  if (error && typeof error === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    errorInfo.message = error.message || String(error);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    errorInfo.name = error.name || 'Error';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (error.stack) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      errorInfo.stack = error.stack;
    }
  } else if (error !== undefined && error !== null) {
    // Handle primitive error values (strings, numbers, etc.)
    errorInfo.message = String(error);
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
  /* istanbul ignore next */
  if (!diagnosticsClient) {
    return;
  }

  try {
    diagnosticsClient.recordEvent('analytics.errors.uncaught', errorInfo);
  } catch (e) {
    // Silently fail to prevent infinite error loops
    // In production, we don't want error reporting to cause more errors
  }
}
