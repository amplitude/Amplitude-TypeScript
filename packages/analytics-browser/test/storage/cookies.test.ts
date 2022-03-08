import { Cookies } from '../../src/storage/cookies';

describe('cookies', () => {
  describe('isEnabled', () => {
    test('should return false', () => {
      const cookies = new Cookies();
      jest.spyOn(cookies, 'get').mockImplementationOnce(() => {
        throw new Error();
      });
      expect(cookies.isEnabled()).toBe(false);
    });

    test('should return true', () => {
      const cookies = new Cookies();
      expect(cookies.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    test('should return null for no cookie value', () => {
      const cookies = new Cookies();
      expect(cookies.get('hello')).toBe(null);
    });

    test('should return cookie value', () => {
      const cookies = new Cookies();
      cookies.set('hello', 'world');
      expect(cookies.get('hello')).toBe('world');
      cookies.set('hello', null);
    });
  });

  describe('set', () => {
    test('should set cookie value', () => {
      const cookies = new Cookies();
      cookies.set('hello', 'world');
      expect(cookies.get('hello')).toBe('world');
      cookies.set('hello', null);
    });

    test('should set cookie value with options', () => {
      const cookies = new Cookies();
      cookies.set('hello', 'world', {
        expirationDays: 365,
        domain: '',
        secure: false,
        sameSite: 'Lax',
      });
      expect(cookies.get('hello')).toBe('world');
      cookies.set('hello', null);
    });

    test('should set restricted cookie value with options', () => {
      const cookies = new Cookies();
      cookies.set('hello', 'world', {
        expirationDays: 365,
        domain: '.amplitude.com',
        secure: true,
        sameSite: 'Lax',
      });
      expect(cookies.get('hello')).toBe(null);
      cookies.set('hello', null);
    });
  });

  describe('remove', () => {
    test('should call set', () => {
      const cookies = new Cookies();
      const set = jest.spyOn(cookies, 'set');
      cookies.remove('key');
      expect(set).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    test('should return undefined', () => {
      const cookies = new Cookies();
      expect(cookies.reset()).toBe(undefined);
    });
  });
});
