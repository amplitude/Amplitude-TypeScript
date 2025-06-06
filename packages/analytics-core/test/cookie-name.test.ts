import { getCookieName, getOldCookieName } from '../src/cookie-name';

describe('cookie-name', () => {
  const API_KEY = 'apiKey';
  describe('getCookieName', () => {
    test('should return cookie name', () => {
      expect(getCookieName(API_KEY)).toBe('AMP_apiKey');
    });

    test('should handle apiKey is empty string', () => {
      expect(getCookieName('')).toBe('AMP');
    });
  });

  describe('getOldCookieName', () => {
    test('should return cookie name', () => {
      expect(getOldCookieName(API_KEY)).toBe('amp_apiKey');
    });

    test('should handle apiKey is empty string', () => {
      expect(getOldCookieName('')).toBe('amp_');
    });
  });
});
