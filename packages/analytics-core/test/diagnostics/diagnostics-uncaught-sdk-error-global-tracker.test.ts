import {
  getExecutionTracker,
  DiagnosticsUncaughtError,
  isPendingSDKError,
  clearPendingSDKError,
} from '../../src/diagnostics/diagnostics-uncaught-sdk-error-global-tracker';

describe('diagnostics-uncaught-sdk-error-global-tracker', () => {
  describe('getExecutionTracker', () => {
    let tracker: ReturnType<typeof getExecutionTracker>;

    beforeEach(() => {
      tracker = getExecutionTracker();
      // Reset tracker state before each test
      while (tracker.getDepth() > 0) {
        tracker.exit();
      }
    });

    afterEach(() => {
      // Clean up: ensure depth is reset
      while (tracker.getDepth() > 0) {
        tracker.exit();
      }
    });

    describe('enter and exit', () => {
      test('should track entry and exit', () => {
        expect(tracker.isInSDKExecution()).toBe(false);
        expect(tracker.getDepth()).toBe(0);

        tracker.enter();

        expect(tracker.isInSDKExecution()).toBe(true);
        expect(tracker.getDepth()).toBe(1);

        tracker.exit();

        expect(tracker.isInSDKExecution()).toBe(false);
        expect(tracker.getDepth()).toBe(0);
      });

      test('should support nested execution contexts', () => {
        tracker.enter();
        expect(tracker.getDepth()).toBe(1);

        tracker.enter();
        expect(tracker.getDepth()).toBe(2);

        tracker.enter();
        expect(tracker.getDepth()).toBe(3);

        tracker.exit();
        expect(tracker.getDepth()).toBe(2);

        tracker.exit();
        expect(tracker.getDepth()).toBe(1);

        tracker.exit();
        expect(tracker.getDepth()).toBe(0);
      });

      test('should not allow negative depth', () => {
        tracker.exit();
        expect(tracker.getDepth()).toBe(0);

        tracker.exit();
        expect(tracker.getDepth()).toBe(0);

        tracker.exit();
        expect(tracker.getDepth()).toBe(0);
      });
    });

    describe('isInSDKExecution', () => {
      test('should return false when not in SDK execution', () => {
        expect(tracker.isInSDKExecution()).toBe(false);
      });

      test('should return true when in SDK execution', () => {
        tracker.enter();
        expect(tracker.isInSDKExecution()).toBe(true);
      });

      test('should return true for nested execution', () => {
        tracker.enter();
        tracker.enter();
        expect(tracker.isInSDKExecution()).toBe(true);
      });
    });

    describe('getDepth', () => {
      test('should return 0 initially', () => {
        expect(tracker.getDepth()).toBe(0);
      });

      test('should return correct depth for nested calls', () => {
        expect(tracker.getDepth()).toBe(0);
        tracker.enter();
        expect(tracker.getDepth()).toBe(1);
        tracker.enter();
        expect(tracker.getDepth()).toBe(2);
        tracker.enter();
        expect(tracker.getDepth()).toBe(3);
      });
    });
  });

  describe('DiagnosticsUncaughtError decorator', () => {
    let tracker: ReturnType<typeof getExecutionTracker>;

    beforeEach(() => {
      tracker = getExecutionTracker();
      // Reset tracker state
      while (tracker.getDepth() > 0) {
        tracker.exit();
      }
    });

    afterEach(() => {
      while (tracker.getDepth() > 0) {
        tracker.exit();
      }
    });

    describe('synchronous methods', () => {
      class TestClass {
        @DiagnosticsUncaughtError
        syncMethod(value: number): number {
          return value * 2;
        }

        @DiagnosticsUncaughtError
        syncMethodThrows(): void {
          throw new Error('Sync error');
        }
      }

      test('should track execution for successful sync method', () => {
        const instance = new TestClass();
        const result = instance.syncMethod(5);

        expect(result).toBe(10);
        expect(tracker.isInSDKExecution()).toBe(false);
        expect(tracker.getDepth()).toBe(0);
      });

      test('should track execution depth during sync method', () => {
        let depthDuringExecution = 0;

        class TestClass2 {
          @DiagnosticsUncaughtError
          captureDepth(): void {
            depthDuringExecution = tracker.getDepth();
          }
        }

        new TestClass2().captureDepth();
        expect(depthDuringExecution).toBe(1);
      });

      test('should tag error and cleanup on sync throw', () => {
        const instance = new TestClass();

        let caughtError: Error | null = null;
        try {
          instance.syncMethodThrows();
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).toBeTruthy();
        expect(caughtError?.message).toBe('Sync error');
        expect(isPendingSDKError(caughtError)).toBe(true);
        expect(tracker.isInSDKExecution()).toBe(false);
        expect(tracker.getDepth()).toBe(0);
      });

      test('should handle non-Error throws', () => {
        class TestClass3 {
          @DiagnosticsUncaughtError
          throwString(): void {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw 'string error';
          }
        }

        const instance = new TestClass3();
        expect(() => instance.throwString()).toThrow('string error');
        expect(tracker.getDepth()).toBe(0);
      });
    });

    describe('asynchronous methods', () => {
      class AsyncTestClass {
        @DiagnosticsUncaughtError
        async asyncMethod(value: number): Promise<number> {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return value * 2;
        }

        @DiagnosticsUncaughtError
        async asyncMethodThrows(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Async error');
        }

        @DiagnosticsUncaughtError
        async asyncMethodThrowsImmediately(): Promise<void> {
          throw new Error('Immediate async error');
        }
      }

      test('should track execution for successful async method', async () => {
        const instance = new AsyncTestClass();
        const result = await instance.asyncMethod(5);

        expect(result).toBe(10);
        expect(tracker.isInSDKExecution()).toBe(false);
        expect(tracker.getDepth()).toBe(0);
      });

      test('should tag error and cleanup on async throw', async () => {
        const instance = new AsyncTestClass();

        let caughtError: Error | null = null;
        try {
          await instance.asyncMethodThrows();
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).toBeTruthy();
        expect(caughtError?.message).toBe('Async error');
        expect(isPendingSDKError(caughtError)).toBe(true);
        expect(tracker.isInSDKExecution()).toBe(false);
        expect(tracker.getDepth()).toBe(0);
      });

      test('should tag error thrown immediately in async method', async () => {
        const instance = new AsyncTestClass();

        let caughtError: Error | null = null;
        try {
          await instance.asyncMethodThrowsImmediately();
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).toBeTruthy();
        expect(caughtError?.message).toBe('Immediate async error');
        expect(isPendingSDKError(caughtError)).toBe(true);
        expect(tracker.getDepth()).toBe(0);
      });

      test('should handle async method that returns non-Error rejection', async () => {
        class TestClass4 {
          @DiagnosticsUncaughtError
          async rejectWithString(): Promise<void> {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw 'string rejection';
          }
        }

        const instance = new TestClass4();
        await expect(instance.rejectWithString()).rejects.toBe('string rejection');
        expect(tracker.getDepth()).toBe(0);
      });

      test('should exit immediately when async method returns Promise, not wait for settlement', () => {
        class TestClass5 {
          @DiagnosticsUncaughtError
          asyncMethod(): Promise<void> {
            return new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        const instance = new TestClass5();
        const promise = instance.asyncMethod();

        // Critical test: depth should be 0 immediately after calling async method
        // This prevents user code errors from being incorrectly flagged as SDK errors
        expect(tracker.getDepth()).toBe(0);
        expect(tracker.isInSDKExecution()).toBe(false);

        // Clean up
        return promise;
      });
    });

    describe('nested decorated methods', () => {
      class NestedTestClass {
        @DiagnosticsUncaughtError
        outer(): number {
          return this.inner() * 2;
        }

        @DiagnosticsUncaughtError
        inner(): number {
          return 5;
        }

        @DiagnosticsUncaughtError
        outerThrows(): void {
          this.innerThrows();
        }

        @DiagnosticsUncaughtError
        innerThrows(): void {
          throw new Error('Inner error');
        }
      }

      test('should handle nested decorated method calls', () => {
        const instance = new NestedTestClass();
        const result = instance.outer();

        expect(result).toBe(10);
        expect(tracker.getDepth()).toBe(0);
      });

      test('should track nested execution depth', () => {
        let depthInInner = 0;

        class TestClass5 {
          @DiagnosticsUncaughtError
          outer(): number {
            return this.inner();
          }

          @DiagnosticsUncaughtError
          inner(): number {
            depthInInner = tracker.getDepth();
            return 42;
          }
        }

        new TestClass5().outer();
        expect(depthInInner).toBe(2);
        expect(tracker.getDepth()).toBe(0);
      });

      test('should cleanup properly when nested method throws', () => {
        const instance = new NestedTestClass();

        let caughtError: Error | null = null;
        try {
          instance.outerThrows();
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError?.message).toBe('Inner error');
        expect(isPendingSDKError(caughtError)).toBe(true);
        expect(tracker.getDepth()).toBe(0);
      });
    });

    describe('Promise-returning non-async methods', () => {
      class PromiseTestClass {
        @DiagnosticsUncaughtError
        returnsPromise(shouldResolve: boolean): Promise<string> {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              if (shouldResolve) {
                resolve('success');
              } else {
                reject(new Error('Promise rejection'));
              }
            }, 10);
          });
        }
      }

      test('should handle Promise-returning method that resolves', async () => {
        const instance = new PromiseTestClass();
        const result = await instance.returnsPromise(true);

        expect(result).toBe('success');
        expect(tracker.getDepth()).toBe(0);
      });

      test('should handle Promise-returning method that rejects', async () => {
        const instance = new PromiseTestClass();

        let caughtError: Error | null = null;
        try {
          await instance.returnsPromise(false);
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError?.message).toBe('Promise rejection');
        expect(isPendingSDKError(caughtError)).toBe(true);
        expect(tracker.getDepth()).toBe(0);
      });
    });
  });

  describe('isPendingSDKError', () => {
    let tracker: ReturnType<typeof getExecutionTracker>;

    beforeEach(() => {
      tracker = getExecutionTracker();
      while (tracker.getDepth() > 0) {
        tracker.exit();
      }
    });

    test('should return false for non-Error values', () => {
      expect(isPendingSDKError(null)).toBe(false);
      expect(isPendingSDKError(undefined)).toBe(false);
      expect(isPendingSDKError('string')).toBe(false);
      expect(isPendingSDKError(123)).toBe(false);
      expect(isPendingSDKError({})).toBe(false);
    });

    test('should return false for untagged Error', () => {
      const error = new Error('Untagged error');
      expect(isPendingSDKError(error)).toBe(false);
    });

    test('should return true for tagged Error from decorated method', () => {
      class TestClass {
        @DiagnosticsUncaughtError
        throwError(): void {
          throw new Error('Tagged error');
        }
      }

      let error: Error | null = null;
      try {
        new TestClass().throwError();
      } catch (e) {
        error = e as Error;
      }

      expect(isPendingSDKError(error)).toBe(true);
    });

    test('should return true for tagged Error from async decorated method', async () => {
      class TestClass {
        @DiagnosticsUncaughtError
        async asyncThrowError(): Promise<void> {
          throw new Error('Tagged async error');
        }
      }

      let error: Error | null = null;
      try {
        await new TestClass().asyncThrowError();
      } catch (e) {
        error = e as Error;
      }

      expect(isPendingSDKError(error)).toBe(true);
    });
  });

  describe('clearPendingSDKError', () => {
    test('should handle non-Error values safely', () => {
      expect(() => clearPendingSDKError(null)).not.toThrow();
      expect(() => clearPendingSDKError(undefined)).not.toThrow();
      expect(() => clearPendingSDKError('string')).not.toThrow();
      expect(() => clearPendingSDKError(123)).not.toThrow();
    });

    test('should clear pending SDK error tag', () => {
      class TestClass {
        @DiagnosticsUncaughtError
        throwError(): void {
          throw new Error('Error to clear');
        }
      }

      let error: Error | null = null;
      try {
        new TestClass().throwError();
      } catch (e) {
        error = e as Error;
      }

      expect(isPendingSDKError(error)).toBe(true);

      clearPendingSDKError(error);

      expect(isPendingSDKError(error)).toBe(false);
    });

    test('should be idempotent', () => {
      class TestClass {
        @DiagnosticsUncaughtError
        throwError(): void {
          throw new Error('Error to clear');
        }
      }

      let error: Error | null = null;
      try {
        new TestClass().throwError();
      } catch (e) {
        error = e as Error;
      }

      clearPendingSDKError(error);
      clearPendingSDKError(error);
      clearPendingSDKError(error);

      expect(isPendingSDKError(error)).toBe(false);
    });
  });
});
