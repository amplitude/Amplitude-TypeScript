import { getExecutionTracker } from '@amplitude/analytics-core';
import { IDiagnosticsClient } from '@amplitude/analytics-core';

export interface ErrorDiagnosticsConfig {
  /**
   * Whether to capture full stack traces in diagnostics
   * @default true
   */
  captureStackTraces?: boolean;

  /**
   * Maximum length of error message to send
   * @default 500
   */
  maxMessageLength?: number;

  /**
   * Maximum length of stack trace to send
   * @default 2000
   */
  maxStackLength?: number;
}

const DEFAULT_CONFIG: Required<ErrorDiagnosticsConfig> = {
  captureStackTraces: true,
  maxMessageLength: 500,
  maxStackLength: 2000,
};

/**
 * Truncate string to max length
 */
function truncate(str: string | undefined, maxLength: number): string {
  if (!str) return '';
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

/**
 * Extract relevant error information for diagnostics
 */
function extractErrorInfo(error: any, config: Required<ErrorDiagnosticsConfig>) {
  const info: Record<string, any> = {
    message: truncate(error.message, config.maxMessageLength),
    name: error.name,
    type: error.constructor?.name || typeof error,
  };

  // Add stack trace if enabled
  if (config.captureStackTraces && error.stack) {
    info.stack = truncate(error.stack, config.maxStackLength);
  }

  return info;
}

/**
 * Setup global error handler to capture uncaught errors from Amplitude SDK
 * Uses execution context tracking to identify SDK errors
 */
export function setupAmplitudeErrorHandler(
  diagnosticsClient: IDiagnosticsClient,
  config?: ErrorDiagnosticsConfig,
): () => void {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const executionTracker = getExecutionTracker();

  const errorHandler = (event: ErrorEvent) => {
    try {
      const error = event.error;

      // Only report if error occurred during SDK execution
      if (!executionTracker.isExecuting()) {
        return; // Customer error, ignore
      }

      const executionContext = executionTracker.getCurrentContext();
      const errorInfo = extractErrorInfo(error, fullConfig);

      // Record the error in diagnostics
      diagnosticsClient.recordEvent('sdk.uncaught_error', {
        ...errorInfo,
        execution_context: executionContext ? executionContext.method : null,
        error_location: event.filename || null,
        error_line: event.lineno || null,
        error_column: event.colno || null,
      });

      diagnosticsClient.increment('sdk.uncaught_errors.total');
    } catch (handlerError) {
      // Silently fail to avoid infinite loops
      console.error('Error in Amplitude error handler:', handlerError);
    }
  };

  // Add the error listener
  if (typeof window !== 'undefined') {
    window.addEventListener('error', errorHandler);
  }

  // Return cleanup function
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('error', errorHandler);
    }
  };
}

/**
 * Setup unhandled promise rejection handler for Amplitude SDK
 */
export function setupAmplitudeRejectionHandler(
  diagnosticsClient: IDiagnosticsClient,
  config?: ErrorDiagnosticsConfig,
): () => void {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const executionTracker = getExecutionTracker();

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    try {
      const error = event.reason;

      // Only report if rejection occurred during SDK execution
      if (!executionTracker.isExecuting()) {
        return; // Customer error, ignore
      }

      const executionContext = executionTracker.getCurrentContext();
      const errorInfo = extractErrorInfo(error, fullConfig);

      // Record the rejection in diagnostics
      diagnosticsClient.recordEvent('sdk.unhandled_rejection', {
        ...errorInfo,
        execution_context: executionContext ? executionContext.method : null,
      });

      diagnosticsClient.increment('sdk.unhandled_rejections.total');
    } catch (handlerError) {
      // Silently fail to avoid infinite loops
      console.error('Error in Amplitude rejection handler:', handlerError);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', rejectionHandler);
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('unhandledrejection', rejectionHandler);
    }
  };
}

/**
 * Setup both error and rejection handlers
 */
export function setupAmplitudeErrorTracking(
  diagnosticsClient: IDiagnosticsClient,
  config?: ErrorDiagnosticsConfig,
): () => void {
  const cleanupError = setupAmplitudeErrorHandler(diagnosticsClient, config);
  const cleanupRejection = setupAmplitudeRejectionHandler(diagnosticsClient, config);

  return () => {
    cleanupError();
    cleanupRejection();
  };
}
