/**
 * @jest-environment jsdom
 * @jest-environment-options { "url": "https://www.example.com" }
 */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { CookieStorage } from '../../src/storage/cookie';
import { isDomainEqual, decodeCookieValue } from '../../src/index';
import * as GlobalScopeModule from '../../src/global-scope';

describe('cookies', () => {
  afterEach(() => {
    delete (CookieStorage as unknown as any).isEnabledCachedResult;
  });
  describe('isEnabled', () => {
    test('regression test re-entrancy issue', async () => {
      const c1 = new CookieStorage();
      const c2 = new CookieStorage();
      // calling isEnabled one after the other should not cause a re-entrancy issue
      const promises = [c1.isEnabled(), c2.isEnabled()];
      const res = await Promise.all(promises);
      expect(res).toEqual([true, true]);
    });

    describe('should return true', () => {
      test('when isEnabled is called', async () => {
        const cookies = new CookieStorage();
        expect(await cookies.isEnabled()).toBe(true);
      });

      test('when isEnabled is called multiple times', async () => {
        const cookies = new CookieStorage();
        expect(await cookies.isEnabled()).toBe(true);
        expect(await cookies.isEnabled()).toBe(true);
      });

      test('if _isEnabled returns false the first time and then returns true', async () => {
        const cookies = new CookieStorage();
        const _isEnabledSpy = jest.spyOn(cookies, '_isEnabled');
        _isEnabledSpy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        expect(await cookies.isEnabled()).toBe(true);
        expect(_isEnabledSpy).toHaveBeenCalledTimes(2);
      });
    });

    test('should return false if _isEnabled returns false after 3 attempts', async () => {
      const mockDiagnosticsClient = {
        recordEvent: jest.fn(),
        increment: jest.fn(),
        recordHistogram: jest.fn(),
        setTag: jest.fn(),
        _flush: jest.fn(),
        _setSampleRate: jest.fn(),
      };
      const cookies = new CookieStorage({}, { diagnosticsClient: mockDiagnosticsClient });
      const _isEnabledSpy = jest.spyOn(cookies, '_isEnabled');
      _isEnabledSpy.mockResolvedValue(false);
      expect(await cookies.isEnabled()).toBe(false);
      expect(_isEnabledSpy).toHaveBeenCalledTimes(3);
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
              }
            },
          }
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
        expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledTimes(3);
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
              }
            },
          }
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
        expect(mockDiagnosticsClient.recordEvent).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('get', () => {
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
      jest.spyOn(GlobalScopeModule, 'getGlobalScope').mockReturnValueOnce(undefined);
      expect(await cookies.get('hello')).toEqual(undefined);
      await cookies.remove('hello');
    });

    test('should return undefined when global scope is defined but document is not', async () => {
      const cookies = new CookieStorage<number[]>();
      await cookies.set('hello', [1]);
      jest.spyOn(GlobalScopeModule, 'getGlobalScope').mockReturnValueOnce({} as typeof globalThis);
      expect(await cookies.get('hello')).toEqual(undefined);
      await cookies.remove('hello');
    });
  });

  describe('set', () => {
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
  });

  describe('remove', () => {
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
});
