import { getCookieName, getOldCookieName } from '../src/cookie-name';
import { API_KEY } from './helpers/constants';

describe('cookie-name', () => {
  describe('getCookieName', () => {
    test('should reutrn cookie name', () => {
      expect(getCookieName(API_KEY)).toBe('AMP_apiKey');
    });
  });

  describe('getOldCookieName', () => {
    test('should reutrn cookie name', () => {
      expect(getOldCookieName(API_KEY)).toBe('amp_apiKey');
    });
  });
});
