import {
  diagnosticsUncaughtError,
  isPendingSDKError,
  clearPendingSDKError,
} from '../../src/diagnostics/diagnostics-uncaught-sdk-error-global-tracker';

describe('diagnostics-uncaught-sdk-error-global-tracker', () => {
  describe('diagnosticsUncaughtError wrapper', () => {
    describe('synchronous functions', () => {
      test('should return result for successful sync function', () => {
        const syncFn = diagnosticsUncaughtError((value: number) => value * 2);
        const result = syncFn(5);

        expect(result).toBe(10);
      });

      test('should tag error and re-throw on sync throw', () => {
        const syncFnThrows = diagnosticsUncaughtError(() => {
          throw new Error('Sync error');
        });

        let caughtError: Error | null = null;
        try {
          syncFnThrows();
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).toBeTruthy();
        expect(caughtError?.message).toBe('Sync error');
        expect(isPendingSDKError(caughtError)).toBe(true);
      });

      test('should handle non-Error throws', () => {
        const throwString = diagnosticsUncaughtError(() => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'string error';
        });

        expect(() => throwString()).toThrow('string error');
      });

      test('should preserve this context', () => {
        const obj = {
          value: 42,
          getValue: diagnosticsUncaughtError(function (this: { value: number }) {
            return this.value;
          }),
        };

        expect(obj.getValue()).toBe(42);
      });

      test('should preserve arguments', () => {
        const fn = diagnosticsUncaughtError((a: number, b: string, c: boolean) => {
          return `${a}-${b}-${String(c)}`;
        });

        expect(fn(1, 'test', true)).toBe('1-test-true');
      });
    });

    describe('asynchronous functions', () => {
      test('should return result for successful async function', async () => {
        const asyncFn = diagnosticsUncaughtError(async (value: number) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return value * 2;
        });

        const result = await asyncFn(5);
        expect(result).toBe(10);
      });

      test('should tag error on async throw', async () => {
        const asyncFnThrows = diagnosticsUncaughtError(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Async error');
        });

        let caughtError: Error | null = null;
        try {
          await asyncFnThrows();
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).toBeTruthy();
        expect(caughtError?.message).toBe('Async error');
        expect(isPendingSDKError(caughtError)).toBe(true);
      });

      test('should tag error thrown immediately in async function', async () => {
        const asyncFnThrowsImmediately = diagnosticsUncaughtError(async () => {
          throw new Error('Immediate async error');
        });

        let caughtError: Error | null = null;
        try {
          await asyncFnThrowsImmediately();
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).toBeTruthy();
        expect(caughtError?.message).toBe('Immediate async error');
        expect(isPendingSDKError(caughtError)).toBe(true);
      });

      test('should handle async function that returns non-Error rejection', async () => {
        const rejectWithString = diagnosticsUncaughtError(async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'string rejection';
        });

        await expect(rejectWithString()).rejects.toBe('string rejection');
      });
    });

    describe('Promise-returning functions', () => {
      test('should handle Promise-returning function that resolves', async () => {
        const returnsPromise = diagnosticsUncaughtError((shouldResolve: boolean) => {
          return new Promise<string>((resolve, reject) => {
            setTimeout(() => {
              if (shouldResolve) {
                resolve('success');
              } else {
                reject(new Error('Promise rejection'));
              }
            }, 10);
          });
        });

        const result = await returnsPromise(true);
        expect(result).toBe('success');
      });

      test('should handle Promise-returning function that rejects', async () => {
        const returnsPromise = diagnosticsUncaughtError((shouldResolve: boolean) => {
          return new Promise<string>((resolve, reject) => {
            setTimeout(() => {
              if (shouldResolve) {
                resolve('success');
              } else {
                reject(new Error('Promise rejection'));
              }
            }, 10);
          });
        });

        let caughtError: Error | null = null;
        try {
          await returnsPromise(false);
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError?.message).toBe('Promise rejection');
        expect(isPendingSDKError(caughtError)).toBe(true);
      });
    });

    describe('nested wrapped functions', () => {
      test('should handle nested wrapped function calls', () => {
        const inner = diagnosticsUncaughtError(() => 5);
        const outer = diagnosticsUncaughtError(() => inner() * 2);

        const result = outer();
        expect(result).toBe(10);
      });

      test('should tag error when inner function throws', () => {
        const innerThrows = diagnosticsUncaughtError(() => {
          throw new Error('Inner error');
        });
        const outerCalls = diagnosticsUncaughtError(() => {
          innerThrows();
        });

        let caughtError: Error | null = null;
        try {
          outerCalls();
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError?.message).toBe('Inner error');
        expect(isPendingSDKError(caughtError)).toBe(true);
      });
    });

    describe('class method wrapping', () => {
      test('should work as arrow function property', () => {
        class TestClass {
          value = 10;
          multiply = diagnosticsUncaughtError((factor: number) => {
            return this.value * factor;
          });
        }

        const instance = new TestClass();
        expect(instance.multiply(3)).toBe(30);
      });

      test('should tag error from wrapped class method', () => {
        class TestClass {
          throwError = diagnosticsUncaughtError(() => {
            throw new Error('Class method error');
          });
        }

        const instance = new TestClass();
        let caughtError: Error | null = null;
        try {
          instance.throwError();
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError?.message).toBe('Class method error');
        expect(isPendingSDKError(caughtError)).toBe(true);
      });

      test('should work with async class methods', async () => {
        class TestClass {
          asyncMethod = diagnosticsUncaughtError(async (value: number) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return value * 2;
          });
        }

        const instance = new TestClass();
        const result = await instance.asyncMethod(5);
        expect(result).toBe(10);
      });
    });
  });

  describe('isPendingSDKError', () => {
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

    test('should return true for tagged Error from wrapped function', () => {
      const throwError = diagnosticsUncaughtError(() => {
        throw new Error('Tagged error');
      });

      let error: Error | null = null;
      try {
        throwError();
      } catch (e) {
        error = e as Error;
      }

      expect(isPendingSDKError(error)).toBe(true);
    });

    test('should return true for tagged Error from async wrapped function', async () => {
      const asyncThrowError = diagnosticsUncaughtError(async () => {
        throw new Error('Tagged async error');
      });

      let error: Error | null = null;
      try {
        await asyncThrowError();
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
      const throwError = diagnosticsUncaughtError(() => {
        throw new Error('Error to clear');
      });

      let error: Error | null = null;
      try {
        throwError();
      } catch (e) {
        error = e as Error;
      }

      expect(isPendingSDKError(error)).toBe(true);

      clearPendingSDKError(error);

      expect(isPendingSDKError(error)).toBe(false);
    });

    test('should be idempotent', () => {
      const throwError = diagnosticsUncaughtError(() => {
        throw new Error('Error to clear');
      });

      let error: Error | null = null;
      try {
        throwError();
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
