import { IDiagnosticsClient } from '../../src/diagnostics/diagnostics-client';

// Mock dependencies
jest.mock('../../src/global-scope');

describe('diagnostics-uncaught-sdk-error-web-handlers', () => {
  let setupAmplitudeErrorTracking: typeof import('../../src/diagnostics/diagnostics-uncaught-sdk-error-web-handlers').setupAmplitudeErrorTracking;
  let getGlobalScope: jest.Mock;
  let globalTracker: typeof import('../../src/diagnostics/diagnostics-uncaught-sdk-error-global-tracker');
  let mockClient: IDiagnosticsClient;
  let mockGlobalScope: { addEventListener: jest.Mock };
  let errorListener: ((event: ErrorEvent) => void) | null = null;
  let rejectionListener: ((event: PromiseRejectionEvent) => void) | null = null;

  beforeEach(() => {
    // Reset modules to get fresh instance with clean state
    jest.resetModules();

    // Re-import after reset to get fresh modules
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    setupAmplitudeErrorTracking =
      require('../../src/diagnostics/diagnostics-uncaught-sdk-error-web-handlers').setupAmplitudeErrorTracking;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getGlobalScope = require('../../src/global-scope').getGlobalScope;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    globalTracker = require('../../src/diagnostics/diagnostics-uncaught-sdk-error-global-tracker');

    // Setup mock diagnostics client
    mockClient = {
      recordEvent: jest.fn(),
      setTag: jest.fn(),
      increment: jest.fn(),
      recordHistogram: jest.fn(),
      saveAllDataToStorage: jest.fn(),
      startTimersIfNeeded: jest.fn(),
      initializeFlushInterval: jest.fn(),
      _flush: jest.fn(),
      fetch: jest.fn(),
      _setSampleRate: jest.fn(),
    } as unknown as IDiagnosticsClient;

    // Setup mock global scope
    errorListener = null;
    rejectionListener = null;
    mockGlobalScope = {
      addEventListener: jest.fn((event: string, listener: (event: ErrorEvent | PromiseRejectionEvent) => void) => {
        if (event === 'error') {
          errorListener = listener as (event: ErrorEvent) => void;
        } else if (event === 'unhandledrejection') {
          rejectionListener = listener as (event: PromiseRejectionEvent) => void;
        }
      }),
    };
    getGlobalScope.mockReturnValue(mockGlobalScope);
  });

  describe('setupAmplitudeErrorTracking', () => {
    test('should setup error and rejection handlers', () => {
      setupAmplitudeErrorTracking(mockClient);

      expect(getGlobalScope).toHaveBeenCalled();
      expect(mockGlobalScope.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockGlobalScope.addEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
      expect(errorListener).not.toBeNull();
      expect(rejectionListener).not.toBeNull();
    });

    test('should not setup handlers twice (duplicate prevention)', () => {
      setupAmplitudeErrorTracking(mockClient);
      setupAmplitudeErrorTracking(mockClient);

      // Should only be called once for error and once for unhandledrejection
      expect(mockGlobalScope.addEventListener).toHaveBeenCalledTimes(2);
    });

    test('should handle missing global scope', () => {
      getGlobalScope.mockReturnValue(null);

      setupAmplitudeErrorTracking(mockClient);

      // Should not throw and should not try to add listeners
      expect(mockGlobalScope.addEventListener).not.toHaveBeenCalled();
    });
  });

  describe('error handler (window.onerror)', () => {
    let isPendingSDKErrorSpy: jest.SpyInstance;
    let clearPendingSDKErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      // Setup spies BEFORE calling setupAmplitudeErrorTracking
      isPendingSDKErrorSpy = jest.spyOn(globalTracker, 'isPendingSDKError');
      clearPendingSDKErrorSpy = jest.spyOn(globalTracker, 'clearPendingSDKError');

      // Now setup error tracking with spies in place
      setupAmplitudeErrorTracking(mockClient);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should report pending SDK errors', () => {
      isPendingSDKErrorSpy.mockReturnValue(true);

      const error = new Error('Test SDK error');
      const errorEvent = {
        error,
        message: 'Test SDK error',
        filename: 'test.js',
        lineno: 10,
        colno: 5,
      } as ErrorEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith('analytics.errors.uncaught', {
        message: 'Test SDK error',
        name: 'Error',
        stack: expect.any(String),
        error_location: 'test.js',
        error_line: 10,
        error_column: 5,
      });
      expect(clearPendingSDKErrorSpy).toHaveBeenCalledWith(error);
    });

    test('should not report non-SDK errors', () => {
      isPendingSDKErrorSpy.mockReturnValue(false);

      const error = new Error('Non-SDK error');
      const errorEvent = {
        error,
        message: 'Non-SDK error',
        filename: 'external.js',
        lineno: 100,
        colno: 50,
      } as ErrorEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).not.toHaveBeenCalled();
      expect(clearPendingSDKErrorSpy).not.toHaveBeenCalled();
    });

    test('should handle error with custom error type', () => {
      isPendingSDKErrorSpy.mockReturnValue(true);

      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const error = new CustomError('Custom error message');
      const errorEvent = {
        error,
        message: 'Custom error message',
        filename: 'custom.js',
        lineno: 15,
        colno: 20,
      } as ErrorEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith('analytics.errors.uncaught', {
        message: 'Custom error message',
        name: 'CustomError',
        stack: expect.any(String),
        error_location: 'custom.js',
        error_line: 15,
        error_column: 20,
      });
    });

    test('should not report null errors (not pending SDK errors)', () => {
      // null errors can't be in the WeakSet, so isPendingSDKError returns false
      isPendingSDKErrorSpy.mockReturnValue(false);

      const errorEvent = {
        error: null,
        message: 'String error message',
        filename: 'nostack.js',
        lineno: 5,
        colno: 10,
      } as ErrorEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).not.toHaveBeenCalled();
    });

    test('should handle error without location information', () => {
      isPendingSDKErrorSpy.mockReturnValue(true);

      const error = new Error('No location');
      const errorEvent = {
        error,
        message: 'No location',
      } as ErrorEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith('analytics.errors.uncaught', {
        message: 'No location',
        name: 'Error',
        stack: expect.any(String),
        // Note: no error_location, error_line, error_column
      });
    });

    test('should silently fail if recordEvent throws', () => {
      isPendingSDKErrorSpy.mockReturnValue(true);

      (mockClient.recordEvent as jest.Mock).mockImplementation(() => {
        throw new Error('RecordEvent failed');
      });

      const error = new Error('Test error');
      const errorEvent = {
        error,
        message: 'Test error',
        filename: 'test.js',
        lineno: 10,
        colno: 5,
      } as ErrorEvent;

      // Should not throw
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(() => errorListener!(errorEvent)).not.toThrow();
    });
  });

  describe('unhandled rejection handler', () => {
    let isPendingSDKErrorSpy: jest.SpyInstance;
    let clearPendingSDKErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      // Setup spies BEFORE calling setupAmplitudeErrorTracking
      isPendingSDKErrorSpy = jest.spyOn(globalTracker, 'isPendingSDKError');
      clearPendingSDKErrorSpy = jest.spyOn(globalTracker, 'clearPendingSDKError');

      // Now setup error tracking with spies in place
      setupAmplitudeErrorTracking(mockClient);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should report pending SDK rejections', () => {
      isPendingSDKErrorSpy.mockReturnValue(true);

      const error = new Error('Async SDK error');
      const rejectedPromise = Promise.reject(error);
      rejectedPromise.catch(() => void 0); // Prevent unhandled rejection

      const rejectionEvent = {
        reason: error,
        promise: rejectedPromise,
      } as unknown as PromiseRejectionEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      rejectionListener!(rejectionEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith('analytics.errors.uncaught', {
        message: 'Async SDK error',
        name: 'Error',
        stack: expect.any(String),
      });
      expect(clearPendingSDKErrorSpy).toHaveBeenCalledWith(error);
    });

    test('should not report non-SDK rejections', () => {
      isPendingSDKErrorSpy.mockReturnValue(false);

      const error = new Error('Non-SDK rejection');
      const rejectedPromise = Promise.reject(error);
      rejectedPromise.catch(() => void 0); // Prevent unhandled rejection

      const rejectionEvent = {
        reason: error,
        promise: rejectedPromise,
      } as unknown as PromiseRejectionEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      rejectionListener!(rejectionEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).not.toHaveBeenCalled();
      expect(clearPendingSDKErrorSpy).not.toHaveBeenCalled();
    });

    test('should handle non-Error rejection reasons', () => {
      // String rejections won't be pending SDK errors since isPendingSDKError checks instanceof Error
      isPendingSDKErrorSpy.mockReturnValue(false);

      const rejectedPromise = Promise.reject('String rejection reason');
      rejectedPromise.catch(() => void 0); // Prevent unhandled rejection

      const rejectionEvent = {
        reason: 'String rejection reason',
        promise: rejectedPromise,
      } as unknown as PromiseRejectionEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      rejectionListener!(rejectionEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).not.toHaveBeenCalled();
    });

    test('should handle custom error types in rejections', () => {
      isPendingSDKErrorSpy.mockReturnValue(true);

      class NetworkError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'NetworkError';
        }
      }

      const error = new NetworkError('Network request failed');
      const rejectedPromise = Promise.reject(error);
      rejectedPromise.catch(() => void 0); // Prevent unhandled rejection

      const rejectionEvent = {
        reason: error,
        promise: rejectedPromise,
      } as unknown as PromiseRejectionEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      rejectionListener!(rejectionEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith('analytics.errors.uncaught', {
        message: 'Network request failed',
        name: 'NetworkError',
        stack: expect.any(String),
      });
    });

    test('should silently fail if recordEvent throws', () => {
      isPendingSDKErrorSpy.mockReturnValue(true);

      (mockClient.recordEvent as jest.Mock).mockImplementation(() => {
        throw new Error('RecordEvent failed');
      });

      const error = new Error('Test rejection');
      const rejectedPromise = Promise.reject(error);
      rejectedPromise.catch(() => void 0); // Prevent unhandled rejection

      const rejectionEvent = {
        reason: error,
        promise: rejectedPromise,
      } as unknown as PromiseRejectionEvent;

      // Should not throw
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(() => rejectionListener!(rejectionEvent)).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    test('should handle both error types in sequence', () => {
      const isPendingSDKErrorSpy = jest.spyOn(globalTracker, 'isPendingSDKError');
      isPendingSDKErrorSpy.mockReturnValue(true);

      setupAmplitudeErrorTracking(mockClient);

      // Trigger window error
      const error1 = new Error('First error');
      const errorEvent = {
        error: error1,
        message: 'First error',
        filename: 'test1.js',
        lineno: 10,
        colno: 5,
      } as ErrorEvent;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // Trigger unhandled rejection
      const error2 = new Error('Second error');
      const rejectedPromise = Promise.reject(error2);
      rejectedPromise.catch(() => void 0); // Prevent unhandled rejection

      const rejectionEvent = {
        reason: error2,
        promise: rejectedPromise,
      } as unknown as PromiseRejectionEvent;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      rejectionListener!(rejectionEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledTimes(2);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenNthCalledWith(
        1,
        'analytics.errors.uncaught',
        expect.objectContaining({
          message: 'First error',
        }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenNthCalledWith(
        2,
        'analytics.errors.uncaught',
        expect.objectContaining({
          message: 'Second error',
        }),
      );

      jest.restoreAllMocks();
    });
  });
});
