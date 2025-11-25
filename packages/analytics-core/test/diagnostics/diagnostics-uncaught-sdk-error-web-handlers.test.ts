import { IDiagnosticsClient } from '../../src/diagnostics/diagnostics-client';

// Mock dependencies
jest.mock('../../src/global-scope');

describe('diagnostics-uncaught-sdk-error-web-handlers', () => {
  let setupAmplitudeErrorTracking: any;
  let getGlobalScope: any;
  let globalTracker: any;
  let mockClient: IDiagnosticsClient;
  let mockGlobalScope: any;
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
      addEventListener: jest.fn((event: string, listener: any) => {
        if (event === 'error') {
          errorListener = listener;
        } else if (event === 'unhandledrejection') {
          rejectionListener = listener;
        }
      }),
    };
    (getGlobalScope as jest.Mock).mockReturnValue(mockGlobalScope);
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
      (getGlobalScope as jest.Mock).mockReturnValue(null);

      setupAmplitudeErrorTracking(mockClient);

      // Should not throw and should not try to add listeners
      expect(mockGlobalScope.addEventListener).not.toHaveBeenCalled();
    });
  });

  describe('error handler (window.onerror)', () => {
    let getExecutionTrackerSpy: jest.SpyInstance;
    let isPendingSDKErrorSpy: jest.SpyInstance;
    let clearPendingSDKErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      // Setup spies BEFORE calling setupAmplitudeErrorTracking
      getExecutionTrackerSpy = jest.spyOn(globalTracker, 'getExecutionTracker');
      isPendingSDKErrorSpy = jest.spyOn(globalTracker, 'isPendingSDKError');
      clearPendingSDKErrorSpy = jest.spyOn(globalTracker, 'clearPendingSDKError');

      // Now setup error tracking with spies in place
      setupAmplitudeErrorTracking(mockClient);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should report errors during SDK execution', () => {
      const mockTracker = {
        enter: jest.fn(),
        exit: jest.fn(),
        isInSDKExecution: jest.fn().mockReturnValue(true),
        getDepth: jest.fn().mockReturnValue(1),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

      const error = new Error('Test error during SDK execution');
      const errorEvent = {
        error,
        message: 'Test error during SDK execution',
        filename: 'test.js',
        lineno: 10,
        colno: 5,
      } as ErrorEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith('analytics.errors.uncaught', {
        message: 'Test error during SDK execution',
        name: 'Error',
        type: 'Error',
        stack: expect.any(String),
        detection_method: 'execution_tracking',
        execution_context: null,
        error_location: 'test.js',
        error_line: 10,
        error_column: 5,
      });
      expect(clearPendingSDKErrorSpy).toHaveBeenCalledWith(error);
    });

    test('should report pending SDK errors even outside execution context', () => {
      const mockTracker = {
        enter: jest.fn(),
        exit: jest.fn(),
        isInSDKExecution: jest.fn().mockReturnValue(false),
        getDepth: jest.fn().mockReturnValue(0),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(true);

      const error = new Error('Pending SDK error');
      const errorEvent = {
        error,
        message: 'Pending SDK error',
        filename: 'async.js',
        lineno: 20,
        colno: 8,
      } as ErrorEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith('analytics.errors.uncaught', {
        message: 'Pending SDK error',
        name: 'Error',
        type: 'Error',
        stack: expect.any(String),
        detection_method: 'execution_tracking',
        execution_context: null,
        error_location: 'async.js',
        error_line: 20,
        error_column: 8,
      });
      expect(clearPendingSDKErrorSpy).toHaveBeenCalledWith(error);
    });

    test('should not report errors outside SDK execution', () => {
      const mockTracker = {
        enter: jest.fn(),
        exit: jest.fn(),
        isInSDKExecution: jest.fn().mockReturnValue(false),
        getDepth: jest.fn().mockReturnValue(0),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
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
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

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
        type: 'CustomError',
        stack: expect.any(String),
        detection_method: 'execution_tracking',
        execution_context: null,
        error_location: 'custom.js',
        error_line: 15,
        error_column: 20,
      });
    });

    test('should handle error without stack trace', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
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
      expect(mockClient.recordEvent).toHaveBeenCalledWith('analytics.errors.uncaught', {
        message: 'String error message',
        name: 'Error',
        type: 'Error',
        detection_method: 'execution_tracking',
        execution_context: null,
        error_location: 'nostack.js',
        error_line: 5,
        error_column: 10,
      });
    });

    test('should handle error with object without message', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

      const errorObj = { custom: 'error' };
      const errorEvent = {
        error: errorObj,
        message: 'Object error',
        filename: 'object.js',
        lineno: 30,
        colno: 15,
      } as unknown as ErrorEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith('analytics.errors.uncaught', {
        message: '[object Object]',
        name: 'Error',
        type: 'Object',
        detection_method: 'execution_tracking',
        execution_context: null,
        error_location: 'object.js',
        error_line: 30,
        error_column: 15,
      });
    });

    test('should handle Event object as message parameter', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

      const mockEvent = { type: 'error', target: {} };
      const errorEvent = {
        error: null,
        message: mockEvent,
        filename: 'event.js',
        lineno: 25,
        colno: 12,
      } as unknown as ErrorEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      errorListener!(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith(
        'analytics.errors.uncaught',
        expect.objectContaining({
          message: '[object Object]',
          detection_method: 'execution_tracking',
        }),
      );
    });

    test('should silently fail if recordEvent throws', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

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

    test('should handle error without location information', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

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
        type: 'Error',
        stack: expect.any(String),
        detection_method: 'execution_tracking',
        execution_context: null,
        // Note: no error_location, error_line, error_column
      });
    });
  });

  describe('unhandled rejection handler', () => {
    let getExecutionTrackerSpy: jest.SpyInstance;
    let isPendingSDKErrorSpy: jest.SpyInstance;
    let clearPendingSDKErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      // Setup spies BEFORE calling setupAmplitudeErrorTracking
      getExecutionTrackerSpy = jest.spyOn(globalTracker, 'getExecutionTracker');
      isPendingSDKErrorSpy = jest.spyOn(globalTracker, 'isPendingSDKError');
      clearPendingSDKErrorSpy = jest.spyOn(globalTracker, 'clearPendingSDKError');

      // Now setup error tracking with spies in place
      setupAmplitudeErrorTracking(mockClient);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should report rejections during SDK execution', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

      const error = new Error('Async error during SDK execution');
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
        message: 'Async error during SDK execution',
        name: 'Error',
        type: 'Error',
        stack: expect.any(String),
        detection_method: 'execution_tracking',
        execution_context: null,
      });
      expect(clearPendingSDKErrorSpy).toHaveBeenCalledWith(error);
    });

    test('should report pending SDK rejections even outside execution context', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(false),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(true);

      const error = new Error('Pending SDK rejection');
      const rejectedPromise = Promise.reject(error);
      rejectedPromise.catch(() => void 0); // Prevent unhandled rejection

      const rejectionEvent = {
        reason: error,
        promise: rejectedPromise,
      } as unknown as PromiseRejectionEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      rejectionListener!(rejectionEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith(
        'analytics.errors.uncaught',
        expect.objectContaining({
          message: 'Pending SDK rejection',
        }),
      );
      expect(clearPendingSDKErrorSpy).toHaveBeenCalledWith(error);
    });

    test('should not report rejections outside SDK execution', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(false),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
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
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
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
      expect(mockClient.recordEvent).toHaveBeenCalledWith(
        'analytics.errors.uncaught',
        expect.objectContaining({
          message: 'String rejection reason',
          detection_method: 'execution_tracking',
        }),
      );
    });

    test('should handle object rejection reasons', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

      const reasonObj = { code: 'ERROR_CODE', details: 'Details' };
      const rejectedPromise = Promise.reject(reasonObj);
      rejectedPromise.catch(() => void 0); // Prevent unhandled rejection

      const rejectionEvent = {
        reason: reasonObj,
        promise: rejectedPromise,
      } as unknown as PromiseRejectionEvent;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      rejectionListener!(rejectionEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockClient.recordEvent).toHaveBeenCalledWith(
        'analytics.errors.uncaught',
        expect.objectContaining({
          message: '[object Object]',
          detection_method: 'execution_tracking',
        }),
      );
    });

    test('should handle custom error types in rejections', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

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
        type: 'NetworkError',
        stack: expect.any(String),
        detection_method: 'execution_tracking',
        execution_context: null,
      });
    });

    test('should silently fail if recordEvent throws', () => {
      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

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
      const getExecutionTrackerSpy = jest.spyOn(globalTracker, 'getExecutionTracker');
      const isPendingSDKErrorSpy = jest.spyOn(globalTracker, 'isPendingSDKError');

      const mockTracker = {
        isInSDKExecution: jest.fn().mockReturnValue(true),
        enter: jest.fn(),
        exit: jest.fn(),
        getDepth: jest.fn(),
      };
      getExecutionTrackerSpy.mockReturnValue(mockTracker);
      isPendingSDKErrorSpy.mockReturnValue(false);

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
