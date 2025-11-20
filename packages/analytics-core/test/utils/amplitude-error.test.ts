import {
  AmplitudeError,
  markAsAmplitudeError,
  isAmplitudeOriginatedError,
  wrapWithErrorTracking,
  getExecutionTracker,
  analyzeStackTrace,
} from '../../src/utils/amplitude-error';

describe('AmplitudeError', () => {
  describe('AmplitudeError class', () => {
    it('should create an AmplitudeError with message', () => {
      const error = new AmplitudeError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AmplitudeError');
      expect(error instanceof Error).toBe(true);
    });

    it('should create an AmplitudeError with context', () => {
      const context = { component: 'TestComponent', operation: 'testOp' };
      const error = new AmplitudeError('Test error', context);
      expect(error.message).toBe('Test error');
      expect(error.context).toEqual(context);
    });

    it('should be identifiable as AmplitudeError', () => {
      const error = new AmplitudeError('Test error');
      expect(AmplitudeError.isAmplitudeError(error)).toBe(true);
    });

    it('should not identify regular errors as AmplitudeError', () => {
      const error = new Error('Regular error');
      expect(AmplitudeError.isAmplitudeError(error)).toBe(false);
    });

    it('should have a stack trace', () => {
      const error = new AmplitudeError('Test error');
      expect(error.stack).toBeDefined();
    });
  });

  describe('markAsAmplitudeError', () => {
    it('should mark a regular error as Amplitude error', () => {
      const error = new Error('Test error');
      expect(isAmplitudeOriginatedError(error)).toBe(false);

      markAsAmplitudeError(error);
      expect(isAmplitudeOriginatedError(error)).toBe(true);
    });

    it('should add context to marked error', () => {
      const error = new Error('Test error');
      const context = { key: 'value' };
      markAsAmplitudeError(error, context);

      expect(isAmplitudeOriginatedError(error)).toBe(true);
      expect((error as any).amplitudeContext).toEqual(context);
    });

    it('should not affect error message or stack', () => {
      const error = new Error('Test error');
      const originalMessage = error.message;
      const originalStack = error.stack;

      markAsAmplitudeError(error);

      expect(error.message).toBe(originalMessage);
      expect(error.stack).toBe(originalStack);
    });
  });

  describe('Execution tracking', () => {
    beforeEach(() => {
      // Reset execution tracker state by exiting all contexts
      const tracker = getExecutionTracker();
      while (tracker.isExecuting()) {
        tracker.exit();
      }
    });

    it('should track execution context', () => {
      const tracker = getExecutionTracker();
      expect(tracker.isExecuting()).toBe(false);

      tracker.enter('TestContext');
      expect(tracker.isExecuting()).toBe(true);

      tracker.exit();
      expect(tracker.isExecuting()).toBe(false);
    });

    it('should handle nested execution contexts', () => {
      const tracker = getExecutionTracker();

      tracker.enter('Context1');
      expect(tracker.isExecuting()).toBe(true);
      expect(tracker.getCurrentContext()?.method).toBe('Context1');

      tracker.enter('Context2');
      expect(tracker.isExecuting()).toBe(true);
      expect(tracker.getCurrentContext()?.method).toBe('Context2');

      tracker.exit();
      expect(tracker.getCurrentContext()?.method).toBe('Context1');

      tracker.exit();
      expect(tracker.isExecuting()).toBe(false);
    });

    it('should track execution stack', () => {
      const tracker = getExecutionTracker();

      tracker.enter('Context1');
      tracker.enter('Context2');
      tracker.enter('Context3');

      const stack = tracker.getExecutionStack();
      expect(stack.length).toBe(3);
      expect(stack[0].method).toBe('Context1');
      expect(stack[1].method).toBe('Context2');
      expect(stack[2].method).toBe('Context3');

      tracker.exit();
      tracker.exit();
      tracker.exit();
    });
  });

  describe('wrapWithErrorTracking', () => {
    beforeEach(() => {
      const tracker = getExecutionTracker();
      while (tracker.isExecuting()) {
        tracker.exit();
      }
    });

    it('should wrap synchronous function and track execution', () => {
      const fn = jest.fn(() => 'result');
      const wrapped = wrapWithErrorTracking(fn, 'TestContext');

      const result = wrapped();

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();

      // Execution should be complete
      const tracker = getExecutionTracker();
      expect(tracker.isExecuting()).toBe(false);
    });

    it('should mark errors from wrapped synchronous functions', () => {
      const error = new Error('Test error');
      const fn = jest.fn(() => {
        throw error;
      });
      const wrapped = wrapWithErrorTracking(fn, 'TestContext');

      expect(() => wrapped()).toThrow();
      expect(isAmplitudeOriginatedError(error)).toBe(true);
    });

    it('should wrap async function and track execution', async () => {
      const fn = jest.fn(async () => 'async result');
      const wrapped = wrapWithErrorTracking(fn, 'TestContext');

      const result = await wrapped();

      expect(result).toBe('async result');
      expect(fn).toHaveBeenCalled();
    });

    it('should mark errors from wrapped async functions', async () => {
      const error = new Error('Async error');
      const fn = jest.fn(async () => {
        throw error;
      });
      const wrapped = wrapWithErrorTracking(fn, 'TestContext');

      await expect(wrapped()).rejects.toThrow();
      expect(isAmplitudeOriginatedError(error)).toBe(true);
    });

    it('should preserve function arguments', () => {
      const fn = jest.fn((a: number, b: string) => a + b);
      const wrapped = wrapWithErrorTracking(fn, 'TestContext');

      const result = wrapped(42, 'test');

      expect(result).toBe('42test');
      expect(fn).toHaveBeenCalledWith(42, 'test');
    });

    it('should add execution context to error', () => {
      const error = new Error('Test error');
      const fn = jest.fn(() => {
        throw error;
      });
      const wrapped = wrapWithErrorTracking(fn, 'TestContext');

      try {
        wrapped();
      } catch (e) {
        expect((e as any).amplitudeContext).toBeDefined();
        expect((e as any).amplitudeContext.sdkContext).toBe('TestContext');
      }
    });
  });

  describe('analyzeStackTrace', () => {
    it('should detect Amplitude errors from stack trace', () => {
      const error = new Error('Test error');
      // Simulate a stack trace with amplitude files
      error.stack = `Error: Test error
        at Object.track (https://cdn.amplitude.com/libs/analytics-browser-1.0.0.js:10:5)
        at HTMLButtonElement.<anonymous> (https://example.com/app.js:20:10)`;

      const result = analyzeStackTrace(error);
      expect(result.isLikelyAmplitudeError).toBe(true);
      expect(result.matchedFiles.length).toBeGreaterThan(0);
    });

    it('should detect Amplitude errors from minified stack trace', () => {
      const error = new Error('Test error');
      // Simulate a minified stack trace
      error.stack = `Error: Test error
        at a (https://cdn.amplitude.com/libs/amplitude-sdk-min.js:1:234)
        at b (https://example.com/bundle.js:5:678)`;

      const result = analyzeStackTrace(error);
      expect(result.isLikelyAmplitudeError).toBe(true);
    });

    it('should not detect non-Amplitude errors', () => {
      const error = new Error('Test error');
      error.stack = `Error: Test error
        at myFunction (https://example.com/app.js:10:5)
        at HTMLButtonElement.<anonymous> (https://example.com/main.js:20:10)`;

      const result = analyzeStackTrace(error);
      expect(result.isLikelyAmplitudeError).toBe(false);
      expect(result.matchedFiles.length).toBe(0);
    });

    it('should handle errors without stack trace', () => {
      const error = new Error('Test error');
      error.stack = undefined;

      const result = analyzeStackTrace(error);
      expect(result.isLikelyAmplitudeError).toBe(false);
      expect(result.matchedFiles.length).toBe(0);
    });

    it('should detect analytics-browser pattern', () => {
      const error = new Error('Test error');
      error.stack = `Error: Test error
        at track (https://cdn.jsdelivr.net/npm/@amplitude/analytics-browser@1.0.0/lib/index.js:100:5)`;

      const result = analyzeStackTrace(error);
      expect(result.isLikelyAmplitudeError).toBe(true);
    });

    it('should detect analytics-core pattern', () => {
      const error = new Error('Test error');
      error.stack = `Error: Test error
        at process (https://unpkg.com/@amplitude/analytics-core@1.0.0/lib/core.js:50:10)`;

      const result = analyzeStackTrace(error);
      expect(result.isLikelyAmplitudeError).toBe(true);
    });
  });
});
