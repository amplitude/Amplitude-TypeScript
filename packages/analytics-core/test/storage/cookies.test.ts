/**
 * @jest-environment jsdom
 */

import { CookieStorage } from '../../src/storage/cookie';
import * as GlobalScopeModule from '../../src/global-scope';

describe('cookies', () => {
  describe('isEnabled', () => {
    test('should return true', async () => {
      const cookies = new CookieStorage();
      expect(await cookies.isEnabled()).toBe(true);
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
});
