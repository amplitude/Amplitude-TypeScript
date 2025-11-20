/**
 * @jest-environment jsdom
 */
import { IDiagnosticsClient } from '@amplitude/analytics-core';
import {
  setupAmplitudeErrorHandler,
  setupAmplitudeRejectionHandler,
  setupAmplitudeErrorTracking,
} from '../../src/utils/error-diagnostics';
import {
  AmplitudeError,
  markAsAmplitudeError,
  getExecutionTracker,
} from '@amplitude/analytics-core';

// Polyfill PromiseRejectionEvent for jsdom
class PromiseRejectionEventPolyfill extends Event {
  promise: Promise<any>;
  reason: any;

  constructor(type: string, init: { promise: Promise<any>; reason: any }) {
    super(type);
    this.promise = init.promise;
    this.reason = init.reason;
  }
}

// Add to global if not present
if (typeof (global as any).PromiseRejectionEvent === 'undefined') {
  (global as any).PromiseRejectionEvent = PromiseRejectionEventPolyfill;
}

describe('Error Diagnostics', () => {
  let mockDiagnosticsClient: jest.Mocked<IDiagnosticsClient>;
  let originalConsoleError: typeof console.error;

  beforeAll(() => {
    // Suppress console.error for cleaner test output
    originalConsoleError = console.error;
    console.error = jest.fn();
  });

  afterAll(() => {
    // Restore console.error
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    mockDiagnosticsClient = {
      setTag: jest.fn(),
      increment: jest.fn(),
      recordHistogram: jest.fn(),
      recordEvent: jest.fn(),
      _flush: jest.fn(),
      _setSampleRate: jest.fn(),
    };

    // Reset execution tracker
    const tracker = getExecutionTracker();
    while (tracker.isExecuting()) {
      tracker.exit();
    }
  });

  describe('setupAmplitudeErrorHandler', () => {
    it('should setup error handler and capture marked errors', () => {
      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient);

      // Trigger an error event with a marked error
      const error = new Error('Test error');
      markAsAmplitudeError(error);

      const errorEvent = new ErrorEvent('error', {
        error,
        message: 'Test error',
        filename: 'test.js',
        lineno: 10,
        colno: 5,
      });
      window.dispatchEvent(errorEvent);

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.uncaught_error',
        expect.objectContaining({
          message: 'Test error',
          name: 'Error',
          detection_method: expect.stringContaining('marked'),
        }),
      );

      expect(mockDiagnosticsClient.increment).toHaveBeenCalledWith('sdk.uncaught_errors.total');

      cleanup();
    });

    it('should capture errors during SDK execution', () => {
      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient);

      // Simulate SDK execution
      const tracker = getExecutionTracker();
      tracker.enter('TestSDKMethod');

      const error = new Error('Error during execution');
      const errorEvent = new ErrorEvent('error', {
        error,
        message: 'Error during execution',
      });
      window.dispatchEvent(errorEvent);

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.uncaught_error',
        expect.objectContaining({
          message: 'Error during execution',
          detection_method: expect.stringContaining('execution_tracking'),
          execution_context: 'TestSDKMethod',
        }),
      );

      tracker.exit();
      cleanup();
    });

    it('should capture errors with Amplitude-like stack traces', () => {
      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient);

      const error = new Error('Test error');
      error.stack = `Error: Test error
        at track (https://cdn.amplitude.com/libs/analytics-browser-1.0.0.js:10:5)
        at main (https://example.com/app.js:20:10)`;

      const errorEvent = new ErrorEvent('error', {
        error,
        message: 'Test error',
      });
      window.dispatchEvent(errorEvent);

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.uncaught_error',
        expect.objectContaining({
          message: 'Test error',
          detection_method: expect.stringContaining('stack_analysis'),
        }),
      );

      cleanup();
    });

    it('should not capture non-Amplitude errors', () => {
      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient);

      const error = new Error('Customer error');
      const errorEvent = new ErrorEvent('error', {
        error,
        message: 'Customer error',
      });
      window.dispatchEvent(errorEvent);

      expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();
      expect(mockDiagnosticsClient.increment).not.toHaveBeenCalled();

      cleanup();
    });

    it('should capture AmplitudeError instances', () => {
      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient);

      const error = new AmplitudeError('Amplitude specific error', {
        component: 'TestComponent',
      });

      const errorEvent = new ErrorEvent('error', {
        error,
        message: error.message,
      });
      window.dispatchEvent(errorEvent);

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.uncaught_error',
        expect.objectContaining({
          message: 'Amplitude specific error',
          name: 'AmplitudeError',
          context: { component: 'TestComponent' },
        }),
      );

      cleanup();
    });

    it('should cleanup event listener when cleanup is called', () => {
      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient);
      cleanup();

      const error = markAsAmplitudeError(new Error('Test error'));

      const errorEvent = new ErrorEvent('error', { error });
      window.dispatchEvent(errorEvent);

      // Should not be called after cleanup
      expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();
    });

    it('should truncate long error messages', () => {
      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient, {
        maxMessageLength: 50,
      });

      const longMessage = 'a'.repeat(100);
      const error = new AmplitudeError(longMessage);

      const errorEvent = new ErrorEvent('error', { error });
      window.dispatchEvent(errorEvent);

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.uncaught_error',
        expect.objectContaining({
          message: expect.stringMatching(/^a+\.\.\.$/),
        }),
      );

      // Verify it was truncated
      const recordedMessage = (mockDiagnosticsClient.recordEvent as jest.Mock).mock.calls[0][1].message;
      expect(recordedMessage.length).toBeLessThanOrEqual(53); // 50 + '...'

      cleanup();
    });

    it('should handle errors without stack traces', () => {
      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient, {
        captureStackTraces: false,
      });

      const error = new AmplitudeError('Error without stack');
      error.stack = undefined;

      const errorEvent = new ErrorEvent('error', { error });
      window.dispatchEvent(errorEvent);

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.uncaught_error',
        expect.objectContaining({
          message: 'Error without stack',
        }),
      );

      // Check that stack is not included
      const properties = (mockDiagnosticsClient.recordEvent as jest.Mock).mock.calls[0][1];
      expect(properties.stack).toBeUndefined();

      cleanup();
    });
  });

  describe('setupAmplitudeRejectionHandler', () => {
    it('should capture marked promise rejections', async () => {
      const cleanup = setupAmplitudeRejectionHandler(mockDiagnosticsClient);

      const error = new Error('Promise rejection');
      markAsAmplitudeError(error);

      // Use a resolved promise to avoid unhandled rejection warnings
      const promise = Promise.resolve().then(() => {
        throw error;
      });
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise,
        reason: error,
      });
      window.dispatchEvent(rejectionEvent);

      // Catch the rejection to prevent test warnings
      promise.catch(() => {
        /* intentional */
      });

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.unhandled_rejection',
        expect.objectContaining({
          message: 'Promise rejection',
          detection_method: expect.stringContaining('marked'),
        }),
      );

      expect(mockDiagnosticsClient.increment).toHaveBeenCalledWith('sdk.unhandled_rejections.total');

      cleanup();
    });

    it('should capture rejections during SDK execution', () => {
      const cleanup = setupAmplitudeRejectionHandler(mockDiagnosticsClient);

      const tracker = getExecutionTracker();
      tracker.enter('AsyncOperation');

      const error = new Error('Async error');
      const promise = Promise.resolve().then(() => {
        throw error;
      });
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise,
        reason: error,
      });
      window.dispatchEvent(rejectionEvent);
      
      // Catch the rejection to prevent test warnings
      promise.catch(() => {
        /* intentional */
      });

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.unhandled_rejection',
        expect.objectContaining({
          message: 'Async error',
          detection_method: expect.stringContaining('execution_tracking'),
          execution_context: 'AsyncOperation',
        }),
      );

      tracker.exit();
      cleanup();
    });

    it('should not capture non-Amplitude rejections', () => {
      const cleanup = setupAmplitudeRejectionHandler(mockDiagnosticsClient);

      const error = new Error('Customer promise rejection');
      const promise = Promise.resolve().then(() => {
        throw error;
      });
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise,
        reason: error,
      });
      window.dispatchEvent(rejectionEvent);
      
      // Catch the rejection to prevent test warnings
      promise.catch(() => {
        /* intentional */
      });

      expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();

      cleanup();
    });

    it('should cleanup event listener when cleanup is called', () => {
      const cleanup = setupAmplitudeRejectionHandler(mockDiagnosticsClient);
      cleanup();

      const error = new Error('Test rejection');
      markAsAmplitudeError(error);

      const promise = Promise.resolve().then(() => {
        throw error;
      });
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise,
        reason: error,
      });
      window.dispatchEvent(rejectionEvent);
      
      // Catch the rejection to prevent test warnings
      promise.catch(() => {
        /* intentional */
      });

      expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();
    });
  });

  describe('setupAmplitudeErrorTracking', () => {
    it('should setup both error and rejection handlers', () => {
      const cleanup = setupAmplitudeErrorTracking(mockDiagnosticsClient);

      // Test error handler
      const error1 = new AmplitudeError('Test error');
      const errorEvent = new ErrorEvent('error', { error: error1 });
      window.dispatchEvent(errorEvent);

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.uncaught_error',
        expect.any(Object),
      );

      mockDiagnosticsClient.recordEvent.mockClear();

      // Test rejection handler
      const error2 = new AmplitudeError('Test rejection');
      const promise = Promise.resolve().then(() => {
        throw error2;
      });
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise,
        reason: error2,
      });
      window.dispatchEvent(rejectionEvent);
      
      // Catch the rejection to prevent test warnings
      promise.catch(() => {
        /* intentional */
      });

      expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledWith(
        'sdk.unhandled_rejection',
        expect.any(Object),
      );

      cleanup();
    });

    it('should cleanup both handlers', () => {
      const cleanup = setupAmplitudeErrorTracking(mockDiagnosticsClient);
      cleanup();

      // Test that both handlers are cleaned up
      const error = new AmplitudeError('Test');

      const errorEvent = new ErrorEvent('error', { error });
      window.dispatchEvent(errorEvent);

      const promise = Promise.resolve().then(() => {
        throw error;
      });
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise,
        reason: error,
      });
      window.dispatchEvent(rejectionEvent);
      
      // Catch the rejection to prevent test warnings
      promise.catch(() => {
        /* intentional */
      });

      expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle null or undefined errors gracefully', () => {
      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient);

      // Trigger error event with null error
      const errorEvent = new ErrorEvent('error', {
        error: null as any,
        message: 'Null error',
      });
      window.dispatchEvent(errorEvent);

      // Should not crash or call recordEvent
      expect(mockDiagnosticsClient.recordEvent).not.toHaveBeenCalled();

      cleanup();
    });

    it('should not cause infinite loops if diagnostics itself throws', () => {
      // Mock recordEvent to throw an error
      mockDiagnosticsClient.recordEvent.mockImplementation(() => {
        throw new Error('Diagnostics error');
      });

      const cleanup = setupAmplitudeErrorHandler(mockDiagnosticsClient);

      // This should not cause an infinite loop
      const error = new AmplitudeError('Test error');
      const errorEvent = new ErrorEvent('error', { error });

      expect(() => {
        window.dispatchEvent(errorEvent);
      }).not.toThrow();

      cleanup();
    });
  });
});
