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

    test('should return cookie object value', async () => {
      const cookies = new CookieStorage<Record<string, number>>();
      await cookies.set('hello', { a: 1 });
      expect(cookies.get('hello')).toEqual({ a: 1 });
      await cookies.remove('hello');
    });

    test('should return cookie array value', async () => {
      const cookies = new CookieStorage<number[]>();
      await cookies.set('hello', [1]);
      expect(cookies.get('hello')).toEqual([1]);
      await cookies.remove('hello');
    });
  });

  describe('set', () => {
    test('should set cookie value', async () => {
      const cookies = new CookieStorage();
      await cookies.set('hello', 'world');
      expect(cookies.get('hello')).toBe('world');
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
      expect(cookies.get('hello')).toBe('world');
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
      expect(cookies.get('hello')).toBe(undefined);
      await cookies.remove('hello');
    });
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
    test('should return undefined', () => {
      const cookies = new CookieStorage();
      expect(cookies.reset()).toBe(undefined);
    });
  });
});
