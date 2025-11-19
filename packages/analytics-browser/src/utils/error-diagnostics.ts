import {
  isAmplitudeOriginatedError,
  getExecutionTracker,
  analyzeStackTrace,
  AmplitudeError,
} from '@amplitude/analytics-core';
import { IDiagnosticsClient } from '@amplitude/analytics-core';

export interface ErrorDiagnosticsConfig {
  /**
   * Whether to enable stack trace analysis as fallback detection
   * @default true
   */
  enableStackTraceAnalysis?: boolean;

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
  enableStackTraceAnalysis: true,
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

  // Add Amplitude-specific context if available
  if ((error as any).amplitudeContext) {
    info.amplitudeContext = (error as any).amplitudeContext;
  }

  // Add context from AmplitudeError
  if (AmplitudeError.isAmplitudeError(error)) {
    info.context = error.context;
  }

  return info;
}

/**
 * Setup global error handler to capture uncaught errors from Amplitude SDK
 * Uses multiple detection methods:
 * 1. Execution context tracking (primary)
 * 2. Error marker check (for intentionally thrown errors)
 * 3. Stack trace analysis (fallback)
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

      // Method 1: Check if error is already marked as Amplitude error
      const isMarkedError = isAmplitudeOriginatedError(error);

      // Method 2: Check if error occurred during SDK execution
      const isDuringSdkExecution = executionTracker.isExecuting();
      const executionContext = executionTracker.getCurrentContext();

      // Method 3: Analyze stack trace (fallback)
      let stackAnalysis = { isLikelyAmplitudeError: false, matchedFiles: [] as string[] };
      if (fullConfig.enableStackTraceAnalysis && error instanceof Error) {
        stackAnalysis = analyzeStackTrace(error);
      }

      // Determine if this is an Amplitude SDK error
      const isAmplitudeError = isMarkedError || isDuringSdkExecution || stackAnalysis.isLikelyAmplitudeError;

      if (!isAmplitudeError) {
        return; // Not an Amplitude SDK error, ignore
      }

      // Extract error information
      const errorInfo = extractErrorInfo(error, fullConfig);

      // Add detection method information
      const detectionMethods = [];
      if (isMarkedError) detectionMethods.push('marked');
      if (isDuringSdkExecution) detectionMethods.push('execution_tracking');
      if (stackAnalysis.isLikelyAmplitudeError) detectionMethods.push('stack_analysis');

      // Record the error in diagnostics
      diagnosticsClient.recordEvent('sdk.uncaught_error', {
        ...errorInfo,
        detection_method: detectionMethods.join(','),
        execution_context: executionContext ? executionContext.method : null,
        matched_files: stackAnalysis.matchedFiles.length > 0 ? stackAnalysis.matchedFiles.join(',') : null,
        error_location: event.filename || null,
        error_line: event.lineno || null,
        error_column: event.colno || null,
      });

      diagnosticsClient.increment('sdk.uncaught_errors.total');
    } catch (handlerError) {
      // Silently fail to avoid infinite loops
      // Don't report handler errors to prevent recursion
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

      // Method 1: Check if error is already marked as Amplitude error
      const isMarkedError = isAmplitudeOriginatedError(error);

      // Method 2: Check if rejection occurred during SDK execution
      const isDuringSdkExecution = executionTracker.isExecuting();
      const executionContext = executionTracker.getCurrentContext();

      // Method 3: Analyze stack trace (fallback)
      let stackAnalysis = { isLikelyAmplitudeError: false, matchedFiles: [] as string[] };
      if (fullConfig.enableStackTraceAnalysis && error instanceof Error) {
        stackAnalysis = analyzeStackTrace(error);
      }

      // Determine if this is an Amplitude SDK error
      const isAmplitudeError = isMarkedError || isDuringSdkExecution || stackAnalysis.isLikelyAmplitudeError;

      if (!isAmplitudeError) {
        return; // Not an Amplitude SDK error, ignore
      }

      // Extract error information
      const errorInfo = extractErrorInfo(error, fullConfig);

      // Add detection method information
      const detectionMethods = [];
      if (isMarkedError) detectionMethods.push('marked');
      if (isDuringSdkExecution) detectionMethods.push('execution_tracking');
      if (stackAnalysis.isLikelyAmplitudeError) detectionMethods.push('stack_analysis');

      // Record the rejection in diagnostics
      diagnosticsClient.recordEvent('sdk.unhandled_rejection', {
        ...errorInfo,
        detection_method: detectionMethods.join(','),
        execution_context: executionContext ? executionContext.method : null,
        matched_files: stackAnalysis.matchedFiles.length > 0 ? stackAnalysis.matchedFiles.join(',') : null,
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
