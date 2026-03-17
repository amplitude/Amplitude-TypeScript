/**
 * @jest-environment jsdom
 * @jest-environment-options { "url": "https://www.example.com" }
 */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { CookieStorage } from '../../src/storage/cookie';
import { isDomainEqual, decodeCookieValue } from '../../src/index';
import * as GlobalScopeModule from '../../src/global-scope';
import { StorageSync } from '../../src/types/storage';
import { enforceStrictCookieNames } from '../helpers/util';

describe('cookies', () => {
  let undoStrictCookieNames: () => void;
  beforeEach(() => {
    // Enforce strict cookie names. This is important, do not remove it.
    undoStrictCookieNames = enforceStrictCookieNames();
  });

  afterEach(() => {
    undoStrictCookieNames();
  });

  describe('isEnabled', () => {
    describe('concurrent calls', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      test('regression test re-entrancy issue', async () => {
        const c1 = new CookieStorage();
        const c2 = new CookieStorage();
        // calling isEnabled one after the other should not cause a re-entrancy issue
        const p1 = c1.isEnabled();
        jest.advanceTimersByTime(10);
        const p2 = c2.isEnabled();
        await Promise.all([p1, p2]);
        expect(await p1).toBe(true);
        expect(await p2).toBe(true);
      });
    });

    test('should return true', async () => {
      const cookies = new CookieStorage();
      expect(await cookies.isEnabled()).toBe(true);
    });

    describe('when document is not available', () => {
      let getGlobalScopeSpy: jest.SpyInstance;
      beforeEach(() => {
        getGlobalScopeSpy = jest.spyOn(GlobalScopeModule, 'getGlobalScope').mockReturnValue({} as typeof globalThis);
      });
      afterEach(() => {
        getGlobalScopeSpy.mockRestore();
      });
      test('should return false', async () => {
        const cookies = new CookieStorage();
        expect(await cookies.isEnabled()).toBe(false);
      });
    });

    describe('when document.cookie throws an error', () => {
      let getGlobalScopeSpy: jest.SpyInstance;
      beforeEach(() => {
        getGlobalScopeSpy = jest.spyOn(GlobalScopeModule, 'getGlobalScope').mockReturnValue({} as typeof globalThis);
        getGlobalScopeSpy.mockImplementation(() => {
          return {
            document: {
              cookie: {
                get() {
                  throw new Error('getter error');
                },
                set() {
                  throw new Error('setter error');
                },
              },
            },
          };
        });
      });
      afterEach(() => {
        getGlobalScopeSpy.mockRestore();
      });

      test('should return false', async () => {
        const mockDiagnosticsClient = {
          recordEvent: jest.fn(),
          increment: jest.fn(),
          recordHistogram: jest.fn(),
          setTag: jest.fn(),
          _flush: jest.fn(),
          _setSampleRate: jest.fn(),
        };
        const cookies = new CookieStorage(undefined, { diagnosticsClient: mockDiagnosticsClient as any });
        expect(await cookies.isEnabled()).toBe(false);
        expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledTimes(1);
      });
    });

    describe('when document.cookie returns wrong test value', () => {
      let getGlobalScopeSpy: jest.SpyInstance;
      beforeEach(() => {
        getGlobalScopeSpy = jest.spyOn(GlobalScopeModule, 'getGlobalScope').mockReturnValue({} as typeof globalThis);
        getGlobalScopeSpy.mockImplementation(() => {
          return {
            document: {
              cookie: {
                get() {
                  return 'wrong value';
                },
                set() {
                  return 'wrong value';
                },
              },
            },
          };
        });
      });
      afterEach(() => {
        getGlobalScopeSpy.mockRestore();
      });
      test('should return false', async () => {
        const mockDiagnosticsClient = {
          recordEvent: jest.fn(),
          increment: jest.fn(),
          recordHistogram: jest.fn(),
          setTag: jest.fn(),
          _flush: jest.fn(),
          _setSampleRate: jest.fn(),
        };
        const cookies = new CookieStorage(undefined, { diagnosticsClient: mockDiagnosticsClient as any });
        expect(await cookies.isEnabled()).toBe(false);
        expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('get', () => {
    beforeEach(() => {
      undoStrictCookieNames?.();
    });

    test('should return undefined for no cookie value', async () => {
      const cookies = new CookieStorage();
      expect(await cookies.get('hello')).toBe(undefined);
    });

    test('should return non-encoded value', async () => {
      const cookies = new CookieStorage();
      document.cookie = 'hello=world';
      expect(await cookies.get('hello')).toBe(undefined);
      await cookies.remove('world');
    });

    test('should handle double url encoded value for Ruby Rails', async () => {
      const cookies = new CookieStorage();
      const value = { a: 1 };
      const cookieValue = encodeURIComponent(btoa(encodeURIComponent(JSON.stringify(value))));
      document.cookie = `hello=${cookieValue}`;
      expect(await cookies.get('hello')).toEqual(value);
      await cookies.remove('world');
    });

    test('should return cookie object value', async () => {
      const cookies = new CookieStorage<Record<string, number>>();
      await cookies.set('hello', { a: 1 });
      expect(await cookies.get('hello')).toEqual({ a: 1 });
      await cookies.remove('hello');
    });

    test('should catch non-json format value', async () => {
      const cookies = new CookieStorage();
      const value = '{"a":1';
      const encodedValue = btoa(encodeURIComponent(value));
      document.cookie = `hello=${encodedValue}`;
      expect(await cookies.get('hello')).toBe(undefined);
    });

    test('should return cookie array value', async () => {
      const cookies = new CookieStorage<number[]>();
      await cookies.set('hello', [1]);
      expect(await cookies.get('hello')).toEqual([1]);
      await cookies.remove('hello');
    });

    test('should return undefined when global scope is not defined', async () => {
      const cookies = new CookieStorage<number[]>();
      await cookies.set('hello', [1]);
      jest.spyOn(GlobalScopeModule, 'getGlobalScope').mockReturnValue(undefined);
      expect(await cookies.get('hello')).toEqual(undefined);
      await cookies.remove('hello');
    });

    test('should return undefined when global scope is defined but document is not', async () => {
      const cookies = new CookieStorage<number[]>();
      await cookies.set('hello', [1]);
      jest.spyOn(GlobalScopeModule, 'getGlobalScope').mockReturnValue({} as typeof globalThis);
      expect(await cookies.get('hello')).toEqual(undefined);
      await cookies.remove('hello');
    });
  });

  describe('set', () => {
    beforeEach(() => {
      undoStrictCookieNames?.();
    });

    test('should set cookie value', async () => {
      const cookies = new CookieStorage();
      await cookies.set('hello', 'world');
      expect(await cookies.get('hello')).toBe('world');
      await cookies.remove('hello');
    });

    test('should set cookie value with options', async () => {
      const cookies = new CookieStorage({
        expirationDays: 365,
        domain: '',
        secure: false,
        sameSite: 'Lax',
      });
      await cookies.set('hello', 'world');
      expect(await cookies.get('hello')).toBe('world');
      await cookies.remove('hello');
    });

    test('should set restricted cookie value with options', async () => {
      const cookies = new CookieStorage({
        expirationDays: 365,
        domain: '.amplitude.com',
        secure: true,
        sameSite: 'Lax',
      });
      await cookies.set('hello', 'world');
      expect(await cookies.get('hello')).toBe(undefined);
      await cookies.remove('hello');
    });

    test.each([new Error('Simulated error'), 'Simulated error'])(
      'logs an error message when setting a cookie fails',
      async (error) => {
        console.error = jest.fn();
        jest.spyOn(global, 'btoa').mockImplementation(() => {
          throw error;
        });

        const cookies = new CookieStorage();
        await cookies.set('hello', 'world');

        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining(
            `Amplitude Logger [Error]: Failed to set cookie for key: hello. Error: Simulated error`,
          ),
        );

        jest.restoreAllMocks();
      },
    );

    describe('when document is not available on globalScope (like React Native)', () => {
      let getGlobalScopeSpy: jest.SpyInstance;

      beforeEach(() => {
        document.cookie = '';
        getGlobalScopeSpy = jest.spyOn(GlobalScopeModule, 'getGlobalScope').mockReturnValue({} as typeof globalThis);
      });

      afterEach(() => {
        getGlobalScopeSpy.mockRestore();
      });

      test('setSync exits without error', async () => {
        const cookies = new CookieStorage();
        await expect(cookies.set('key', 'value')).resolves.toBeUndefined();
        expect(document.cookie).toBe('');
        getGlobalScopeSpy.mockRestore();
      });
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      undoStrictCookieNames?.();
    });

    test('should call set', async () => {
      const cookies = new CookieStorage();
      const set = jest.spyOn(cookies, 'set');
      await cookies.remove('key');
      expect(set).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    test('should return undefined', async () => {
      const cookies = new CookieStorage();
      expect(await cookies.reset()).toBe(undefined);
    });
  });
  describe('duplicateResolverFn', () => {
    let tldCookies: CookieStorage<Record<string, string>>;
    let subdomainCookies: CookieStorage<Record<string, string>>;
    beforeEach(() => {
      undoStrictCookieNames?.();
      tldCookies = new CookieStorage<Record<string, string>>(
        {
          domain: 'example.com',
        },
        {
          duplicateResolverFn: (value: string) => {
            const decodedValue = decodeURIComponent(atob(value));
            const parsedValue = JSON.parse(decodedValue);
            if (parsedValue.a === 'keep') {
              return true;
            }
            return false;
          },
        },
      );
      subdomainCookies = new CookieStorage<Record<string, string>>({
        domain: 'www.example.com',
      });
    });
    test('should de-duplicate cookies', async () => {
      await tldCookies.set('dummy', { a: 'ignore' });

      // set 2 conflicting cookies on example.com and www.example.com
      await tldCookies.set('hello', { a: 'ignore' });
      await subdomainCookies.set('hello', { a: 'keep' });

      // should resolve to the cookie that
      expect(await tldCookies.get('hello')).toEqual({ a: 'keep' });
      await tldCookies.remove('hello');
    });

    test('should record diagnostics when duplicateResolverFn returns false', async () => {
      const diagnosticsClient = {
        recordEvent: jest.fn(),
        increment: jest.fn(),
      };
      const cookieStorageWithDiagnostics = new CookieStorage<Record<string, string>>(
        {
          domain: 'example.com',
        },
        {
          duplicateResolverFn: (value: string) => {
            const decodedValue = decodeURIComponent(atob(value));
            const parsedValue = JSON.parse(decodedValue);
            // Return false for "ignore", true for "keep"
            return parsedValue.a === 'keep';
          },
          diagnosticsClient: diagnosticsClient as any,
        },
      );

      // Set up duplicate cookies - one to ignore, one to keep
      await tldCookies.set('test', { a: 'ignore' });
      await subdomainCookies.set('test', { a: 'keep' });

      await cookieStorageWithDiagnostics.get('test');

      expect(diagnosticsClient.increment).toHaveBeenCalledWith('cookies.duplicate.occurrence.document.cookie');
      await tldCookies.remove('test');
    });
  });

  describe('cookieStore', () => {
    let cookieStorage: CookieStorage<string>;
    let globalScope: any;
    beforeEach(() => {
      cookieStorage = new CookieStorage({
        domain: 'domain.com',
      });
      globalScope = GlobalScopeModule.getGlobalScope() || {};
      const cookies: any = {};

      // setting up cookieStore mock because JSDom doesn't support cookieStore
      globalScope.cookieStore = {
        set({ name, value, domain }: any) {
          cookies[domain] = cookies[domain] || {};
          cookies[domain][name] = value;
        },
        getAll(key: string) {
          const output: any[] = [];
          for (const domain of Object.keys(cookies)) {
            output.push({
              key,
              value: cookies[domain][key],
              domain,
            });
          }
          return output;
        },
      };
    });

    afterAll(() => {
      delete globalScope.cookieStore;
    });

    test('should read from cookieStore', async () => {
      const value = {
        hello: 'world!',
      };
      await globalScope.cookieStore.set({
        name: 'hello',
        value: btoa(encodeURIComponent(JSON.stringify(value))),
        domain: 'domain.com',
      });
      expect(await cookieStorage.get('hello')).toEqual({ hello: 'world!' });
    });

    test('should record diagnostics when duplicate cookies are detected', async () => {
      const diagnosticsClient = {
        recordEvent: jest.fn(),
        increment: jest.fn(),
      };
      const cookieStorageWithDiagnostics = new CookieStorage<string>(
        {
          domain: 'domain.com',
        },
        {
          diagnosticsClient: diagnosticsClient as any,
        },
      );

      // Mock cookieStore to return multiple cookies
      globalScope.cookieStore.getAll = jest.fn().mockResolvedValue([
        { name: 'hello', value: btoa(encodeURIComponent(JSON.stringify('value1'))), domain: 'domain.com' },
        { name: 'hello', value: btoa(encodeURIComponent(JSON.stringify('value2'))), domain: 'other.com' },
      ]);

      await cookieStorageWithDiagnostics.get('hello');

      expect(diagnosticsClient.recordEvent).toHaveBeenCalledWith('cookies.duplicate', {
        cookies: ['domain.com', 'other.com'],
      });
      expect(diagnosticsClient.increment).toHaveBeenCalledWith('cookies.duplicate.occurrence.cookieStore');
    });
  });

  describe('isDomainEqual', () => {
    test('should return true if domains are equal disregard leading .', () => {
      expect(isDomainEqual('.domain.com', 'domain.com')).toBe(true);
      expect(isDomainEqual('domain.com', '.domain.com')).toBe(true);
    });

    it('should return false if either domain is undefined', () => {
      expect(isDomainEqual(undefined, 'domain.com')).toBe(false);
      expect(isDomainEqual('domain.com', undefined)).toBe(false);
      expect(isDomainEqual(undefined, undefined)).toBe(false);
    });

    it('should return false if domains are not equal', () => {
      expect(isDomainEqual('domain.com', 'www.domain.com')).toBe(false);
      expect(isDomainEqual('www.domain.com', 'domain.com')).toBe(false);
    });

    describe('empty values and empty strings', () => {
      test('should return true when both domains are empty strings', () => {
        expect(isDomainEqual('', '')).toBe(true);
      });
      test('should return false if one domain is empty string and other is falsey', () => {
        expect(isDomainEqual('', undefined)).toBe(false);
        expect(isDomainEqual(undefined, '')).toBe(false);
      });
    });
  });

  describe('decodeCookieValue', () => {
    test('should decode standard encoded cookie value', () => {
      const value = { hello: 'world' };
      const encoded = btoa(encodeURIComponent(JSON.stringify(value)));
      expect(decodeCookieValue(encoded)).toBe(JSON.stringify(value));
    });

    test('should decode double URL encoded cookie value (Ruby Rails)', () => {
      const value = { hello: 'world' };
      const encoded = encodeURIComponent(btoa(encodeURIComponent(JSON.stringify(value))));
      expect(decodeCookieValue(encoded)).toBe(JSON.stringify(value));
    });

    test('should return undefined for invalid encoded value', () => {
      expect(decodeCookieValue('not-valid-base64!')).toBe(undefined);
    });
  });

  describe('isDomainWritable', () => {
    beforeEach(() => {
      (CookieStorage as any).cachedTlds = {};
    });

    test('should return true when domain is writable', async () => {
      // jest env is https://www.example.com, so example.com should be writable
      const result = await CookieStorage.isDomainWritable('example.com');
      expect(result).toBe(true);
      // call it again to cover the cachedTlds check
      const result2 = await CookieStorage.isDomainWritable('example.com');
      expect(result2).toBe(true);
    });

    test('should return true from inner cachedTlds check when a concurrent call already cached the domain', async () => {
      const lockQueue: Array<() => Promise<unknown>> = [];
      const processQueue = (): void => {
        if (lockQueue.length === 0) return;
        const run = lockQueue.shift()!;
        run().then(processQueue, processQueue);
      };
      const locks = {
        request: (_lockName: string, callback: () => unknown) => {
          const promise = new Promise<unknown>((resolve, reject) => {
            lockQueue.push(() =>
              Promise.resolve()
                .then(() => callback())
                .then(resolve, reject),
            );
            if (lockQueue.length === 1) {
              Promise.resolve().then(processQueue);
            }
          });
          return promise;
        },
      };
      const nav = global.navigator;
      Object.defineProperty(global, 'navigator', { value: { ...nav, locks }, configurable: true });
      try {
        const [result1, result2] = await Promise.all([
          CookieStorage.isDomainWritable('example.com'),
          CookieStorage.isDomainWritable('example.com'),
        ]);
        expect(result1).toBe(true);
        expect(result2).toBe(true);
      } finally {
        Object.defineProperty(global, 'navigator', { value: nav, configurable: true });
      }
    });

    test('should return false when document is not available', async () => {
      const getGlobalScopeSpy = jest
        .spyOn(GlobalScopeModule, 'getGlobalScope')
        .mockReturnValue({} as typeof globalThis);
      const result = await CookieStorage.isDomainWritable('example.com');
      getGlobalScopeSpy.mockRestore();
      expect(result).toBe(false);
    });

    test('should return false for non-writable domain', async () => {
      // .amplitude.com is not writable from www.example.com
      const result = await CookieStorage.isDomainWritable('amplitude.com');
      expect(result).toBe(false);
    });

    test('should return false if cookie transactions throws error', async () => {
      const getGlobalScopeSpy = jest
        .spyOn(GlobalScopeModule, 'getGlobalScope')
        .mockReturnValue({} as typeof globalThis);
      jest.spyOn(CookieStorage.prototype as any, 'transaction').mockImplementation(() => {
        throw new Error('getter error');
      });
      const result = await CookieStorage.isDomainWritable('example.com');
      getGlobalScopeSpy.mockRestore();
      expect(result).toBe(false);
    });
  });

  describe('transaction', () => {
    beforeEach(() => {
      undoStrictCookieNames?.();
    });

    test('should return the result of the callback', async () => {
      const cookies = new CookieStorage<string>();
      const result = await (cookies as any).transaction('test', (storageSync: StorageSync<string>) => {
        storageSync.set('TEST_VALUE_NO_LOCK');
        return storageSync.get();
      });
      expect(result).toBe('TEST_VALUE_NO_LOCK');
      expect(await cookies.get('test')).toBe('TEST_VALUE_NO_LOCK');
    });

    describe('with mock navigator.locks', () => {
      let lockCallList: string[] = [];

      beforeEach(() => {
        Object.defineProperty(global, 'navigator', {
          value: {
            locks: {
              request: (lockName: string, callback: () => Promise<any>) => {
                lockCallList.push(lockName);
                return callback();
              },
            },
          },
        });
      });
      afterEach(() => {
        lockCallList = [];
        Object.defineProperty(global, 'navigator', {
          value: {
            locks: undefined,
          },
        });
      });
      test('should return the result of the callback', async () => {
        const cookies = new CookieStorage<string>();
        const result = await (cookies as any).transaction('test', (storageSync: StorageSync<string>) => {
          storageSync.set('TEST_VALUE_WITH_LOCK');
          return storageSync.get();
        });
        expect(result).toBe('TEST_VALUE_WITH_LOCK');
        expect(await cookies.get('test')).toBe('TEST_VALUE_WITH_LOCK');
        await cookies.remove('test');
        expect(lockCallList).toEqual(['com.amplitude:cookie-lock:test']);
      });

      test('should fall back to callback when locks.request throws', async () => {
        Object.defineProperty(global, 'navigator', {
          value: {
            locks: {
              request: () => {
                throw new Error('security error');
              },
            },
          },
          configurable: true,
        });
        const cookies = new CookieStorage<string>();
        const result = await (cookies as any).transaction('test', (storageSync: StorageSync<string>) => {
          storageSync.set('VALUE');
          return storageSync.get();
        });
        expect(result).toBe('VALUE');
        expect(await cookies.get('test')).toBe('VALUE');
      });

      test('should handle promise rejection from locks.request', async () => {
        Object.defineProperty(global, 'navigator', {
          value: {
            locks: {
              // Simulate an async locks.request where the callback throws,
              // causing the returned promise to be rejected.
              request: (_lockName: string, callback: () => any) => {
                return Promise.resolve().then(() => callback());
              },
            },
          },
          configurable: true,
        });

        const cookies = new CookieStorage<string>();
        const transactionPromise = (cookies as any).transaction(
          'test',
          (storageSync: StorageSync<string>) => {
            storageSync.set('VALUE_REJECTED_LOCK');
            throw new Error('callback error');
          },
        );

        await expect(transactionPromise).rejects.toThrow('callback error');
      });
    });
  });
});
