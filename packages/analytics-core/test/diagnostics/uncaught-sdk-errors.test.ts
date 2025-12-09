import {
  registerSdkLoaderMetadata,
  enableSdkErrorListeners,
  GLOBAL_KEY,
  EVENT_NAME_ERROR_UNCAUGHT,
} from '../../src/diagnostics/uncaught-sdk-errors';
import { IDiagnosticsClient } from '../../src/diagnostics/diagnostics-client';
import * as globalScopeModule from '../../src/global-scope';

describe('uncaught-sdk-errors', () => {
  let mockGlobalScope: Record<string, unknown> & {
    addEventListener: jest.Mock;
    removeEventListener: jest.Mock;
  };
  let mockDiagnosticsClient: jest.Mocked<IDiagnosticsClient>;
  let errorHandler: ((event: ErrorEvent) => void) | undefined;
  let rejectionHandler: ((event: PromiseRejectionEvent) => void) | undefined;

  beforeEach(() => {
    // Reset global state
    mockGlobalScope = {
      addEventListener: jest.fn((type: string, handler: unknown) => {
        if (type === 'error') {
          errorHandler = handler as (event: ErrorEvent) => void;
        } else if (type === 'unhandledrejection') {
          rejectionHandler = handler as (event: PromiseRejectionEvent) => void;
        }
      }),
      removeEventListener: jest.fn(),
    };

    jest.spyOn(globalScopeModule, 'getGlobalScope').mockReturnValue(mockGlobalScope as unknown as typeof globalThis);

    mockDiagnosticsClient = {
      setTag: jest.fn(),
      increment: jest.fn(),
      recordHistogram: jest.fn(),
      recordEvent: jest.fn(),
      _flush: jest.fn(),
      _setSampleRate: jest.fn(),
    };

    errorHandler = undefined;
    rejectionHandler = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up global state
    delete mockGlobalScope[GLOBAL_KEY];
  });

  describe('registerSdkLoaderMetadata', () => {
    it('should register script URL in global scope', () => {
      registerSdkLoaderMetadata({ scriptUrl: 'https://cdn.amplitude.com/libs/amplitude.js' });

      expect(mockGlobalScope[GLOBAL_KEY]).toBe('https://cdn.amplitude.com/libs/amplitude.js');
    });

    it('should normalize script URL by removing query params', () => {
      registerSdkLoaderMetadata({ scriptUrl: 'https://cdn.amplitude.com/libs/amplitude.js?v=1.0.0' });

      expect(mockGlobalScope[GLOBAL_KEY]).toBe('https://cdn.amplitude.com/libs/amplitude.js');
    });

    it('should normalize script URL by removing hash', () => {
      registerSdkLoaderMetadata({ scriptUrl: 'https://cdn.amplitude.com/libs/amplitude.js#section' });

      expect(mockGlobalScope[GLOBAL_KEY]).toBe('https://cdn.amplitude.com/libs/amplitude.js');
    });

    it('should normalize script URL by removing both query params and hash', () => {
      registerSdkLoaderMetadata({ scriptUrl: 'https://cdn.amplitude.com/libs/amplitude.js?v=1.0.0#section' });

      expect(mockGlobalScope[GLOBAL_KEY]).toBe('https://cdn.amplitude.com/libs/amplitude.js');
    });

    it('should not register if scriptUrl is undefined', () => {
      registerSdkLoaderMetadata({});

      expect(mockGlobalScope[GLOBAL_KEY]).toBeUndefined();
    });

    it('should not register if scriptUrl is empty string', () => {
      registerSdkLoaderMetadata({ scriptUrl: '' });

      expect(mockGlobalScope[GLOBAL_KEY]).toBeUndefined();
    });

    it('should not register if scriptUrl is an invalid URL', () => {
      registerSdkLoaderMetadata({ scriptUrl: 'not-a-valid-url' });

      expect(mockGlobalScope[GLOBAL_KEY]).toBeUndefined();
    });
  });

  describe('enableSdkErrorListeners', () => {
    it('should add error and unhandledrejection event listeners', () => {
      enableSdkErrorListeners(mockDiagnosticsClient);

      expect(mockGlobalScope.addEventListener).toHaveBeenCalledWith('error', expect.any(Function), true);
      expect(mockGlobalScope.addEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function), true);
    });

    it('should not add listeners if global scope is null', () => {
      jest.spyOn(globalScopeModule, 'getGlobalScope').mockReturnValue(null as unknown as typeof globalThis);

      enableSdkErrorListeners(mockDiagnosticsClient);

      expect(mockGlobalScope.addEventListener).not.toHaveBeenCalled();
    });

    it('should not add listeners if addEventListener is not a function', () => {
      const scopeWithoutAddEventListener = { ...mockGlobalScope };
      delete (scopeWithoutAddEventListener as Record<string, unknown>).addEventListener;
      jest
        .spyOn(globalScopeModule, 'getGlobalScope')
        .mockReturnValue(scopeWithoutAddEventListener as unknown as typeof globalThis);

      enableSdkErrorListeners(mockDiagnosticsClient);

      // Should not throw
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      // Register script URL first
      registerSdkLoaderMetadata({ scriptUrl: 'https://cdn.amplitude.com/libs/amplitude.js' });
      enableSdkErrorListeners(mockDiagnosticsClient);
    });

    describe('ErrorEvent handling', () => {
      it('should capture error when filename matches SDK script URL', () => {
        const error = new Error('Test error');
        const errorEvent = {
          message: 'Test error',
          filename: 'https://cdn.amplitude.com/libs/amplitude.js',
          lineno: 100,
          colno: 50,
          error,
          isTrusted: true,
        } as ErrorEvent;

        errorHandler?.(errorEvent);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(EVENT_NAME_ERROR_UNCAUGHT, {
          type: 'error',
          message: 'Test error',
          filename: 'https://cdn.amplitude.com/libs/amplitude.js',
          error_name: 'Error',
          stack: error.stack,
          colno: 50,
          lineno: 100,
          isTrusted: true,
          matchReason: 'filename',
        });
      });

      it('should capture error when stack trace contains SDK script URL', () => {
        const error = new Error('Test error');
        error.stack = `Error: Test error
    at functionName (https://cdn.amplitude.com/libs/amplitude.js:100:50)
    at anotherFunction (https://example.com/app.js:200:30)`;

        const errorEvent = {
          message: 'Test error',
          filename: 'https://example.com/app.js',
          lineno: 200,
          colno: 30,
          error,
          isTrusted: true,
        } as ErrorEvent;

        errorHandler?.(errorEvent);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(EVENT_NAME_ERROR_UNCAUGHT, {
          type: 'error',
          message: 'Test error',
          filename: 'https://example.com/app.js',
          error_name: 'Error',
          stack: error.stack,
          colno: 30,
          lineno: 200,
          isTrusted: true,
          matchReason: 'stack',
        });
      });

      it('should NOT capture error when neither filename nor stack matches SDK script URL', () => {
        const error = new Error('Test error');
        error.stack = `Error: Test error
    at functionName (https://example.com/app.js:100:50)`;

        const errorEvent = {
          message: 'Test error',
          filename: 'https://example.com/app.js',
          lineno: 100,
          colno: 50,
          error,
          isTrusted: true,
        } as ErrorEvent;

        errorHandler?.(errorEvent);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();
      });

      it('should handle error event without error object', () => {
        const errorEvent = {
          message: 'Script error',
          filename: 'https://cdn.amplitude.com/libs/amplitude.js',
          lineno: 0,
          colno: 0,
          error: null,
          isTrusted: true,
        } as ErrorEvent;

        errorHandler?.(errorEvent);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(EVENT_NAME_ERROR_UNCAUGHT, {
          type: 'error',
          message: 'Script error',
          filename: 'https://cdn.amplitude.com/libs/amplitude.js',
          error_name: undefined,
          stack: undefined,
          colno: 0,
          lineno: 0,
          isTrusted: true,
          matchReason: 'filename',
        });
      });
    });

    describe('PromiseRejectionEvent handling', () => {
      it('should capture unhandled rejection when stack contains SDK script URL', () => {
        const error = new Error('Promise rejected');
        error.stack = `Error: Promise rejected
    at async functionName (https://cdn.amplitude.com/libs/amplitude.js:100:50)`;

        const rejectionEvent = {
          reason: error,
          isTrusted: true,
        } as PromiseRejectionEvent;

        rejectionHandler?.(rejectionEvent);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(EVENT_NAME_ERROR_UNCAUGHT, {
          type: 'unhandledrejection',
          message: 'Promise rejected',
          filename: 'https://cdn.amplitude.com/libs/amplitude.js:100:50',
          error_name: 'Error',
          stack: error.stack,
          isTrusted: true,
          matchReason: 'filename',
        });
      });

      it('should NOT capture unhandled rejection when stack does not contain SDK script URL', () => {
        const error = new Error('Promise rejected');
        error.stack = `Error: Promise rejected
    at async functionName (https://example.com/app.js:100:50)`;

        const rejectionEvent = {
          reason: error,
          isTrusted: true,
        } as PromiseRejectionEvent;

        rejectionHandler?.(rejectionEvent);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();
      });

      it('should handle non-Error rejection reason as string', () => {
        // First need to set up a scenario where it would match
        // Since reason is not an Error, stack will be undefined, so it won't match
        const rejectionEvent = {
          reason: 'Simple string rejection',
          isTrusted: true,
        } as PromiseRejectionEvent;

        rejectionHandler?.(rejectionEvent);

        // Should not be captured because there's no way to match without stack
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();
      });

      it('should handle object rejection reason by stringifying', () => {
        const rejectionEvent = {
          reason: { code: 'ERR_001', details: 'Something went wrong' },
          isTrusted: true,
        } as PromiseRejectionEvent;

        rejectionHandler?.(rejectionEvent);

        // Should not be captured because there's no way to match without stack
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();
      });
    });
  });

  describe('without registered script URL', () => {
    beforeEach(() => {
      // Don't register script URL
      enableSdkErrorListeners(mockDiagnosticsClient);
    });

    it('should NOT capture any errors when no script URL is registered', () => {
      const error = new Error('Test error');
      const errorEvent = {
        message: 'Test error',
        filename: 'https://cdn.amplitude.com/libs/amplitude.js',
        lineno: 100,
        colno: 50,
        error,
        isTrusted: true,
      } as ErrorEvent;

      errorHandler?.(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();
    });
  });

  describe('URL normalization edge cases', () => {
    it('should handle filename with query params when matching', () => {
      registerSdkLoaderMetadata({ scriptUrl: 'https://cdn.amplitude.com/libs/amplitude.js' });
      enableSdkErrorListeners(mockDiagnosticsClient);

      const error = new Error('Test error');
      const errorEvent = {
        message: 'Test error',
        filename: 'https://cdn.amplitude.com/libs/amplitude.js?v=2.0.0',
        lineno: 100,
        colno: 50,
        error,
        isTrusted: true,
      } as ErrorEvent;

      errorHandler?.(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        EVENT_NAME_ERROR_UNCAUGHT,
        expect.objectContaining({
          matchReason: 'filename',
        }),
      );
    });
  });
});
