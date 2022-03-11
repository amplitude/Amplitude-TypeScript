import { CookieStorage } from '../../src/storage/cookie';

describe('cookies', () => {
  describe('isEnabled', () => {
    test('should return true', () => {
      const cookies = new CookieStorage();
      expect(cookies.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    test('should return undefined for no cookie value', () => {
      const cookies = new CookieStorage();
      expect(cookies.get('hello')).toBe(undefined);
    });

    test('should return cookie object value', () => {
      const cookies = new CookieStorage<Record<string, number>>();
      cookies.set('hello', { a: 1 });
      expect(cookies.get('hello')).toEqual({ a: 1 });
      cookies.remove('hello');
    });

    test('should return cookie array value', () => {
      const cookies = new CookieStorage<number[]>();
      cookies.set('hello', [1]);
      expect(cookies.get('hello')).toEqual([1]);
      cookies.remove('hello');
    });
  });

  describe('set', () => {
    test('should set cookie value', () => {
      const cookies = new CookieStorage();
      cookies.set('hello', 'world');
      expect(cookies.get('hello')).toBe('world');
      cookies.remove('hello');
    });

    test('should set cookie value with options', () => {
      const cookies = new CookieStorage();
      cookies.set('hello', 'world', {
        expirationDays: 365,
        domain: '',
        secure: false,
        sameSite: 'Lax',
      });
      expect(cookies.get('hello')).toBe('world');
      cookies.remove('hello');
    });

    test('should set restricted cookie value with options', () => {
      const cookies = new CookieStorage();
      cookies.set('hello', 'world', {
        expirationDays: 365,
        domain: '.amplitude.com',
        secure: true,
        sameSite: 'Lax',
      });
      expect(cookies.get('hello')).toBe(undefined);
      cookies.remove('hello');
    });
  });

  describe('remove', () => {
    test('should call set', () => {
      const cookies = new CookieStorage();
      const set = jest.spyOn(cookies, 'set');
      cookies.remove('key');
      expect(set).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    test('should return undefined', () => {
      const cookies = new CookieStorage();
      expect(cookies.reset()).toBe(undefined);
    });
  });
});
