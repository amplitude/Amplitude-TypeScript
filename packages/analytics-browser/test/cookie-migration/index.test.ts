import { getOldCookieName } from '../../src/session-manager';
import { decode, parseOldCookies, parseTime } from '../../src/cookie-migration';
import * as LocalStorageModule from '../../src/storage/local-storage';

describe('cookie-migration', () => {
  const API_KEY = 'asdfasdf';
  afterEach(() => {
    // clean up cookies
    document.cookie = `${getOldCookieName(API_KEY)}=null; expires=-1`;
  });

  describe('parseOldCookies', () => {
    test('should return default values', () => {
      const cookies = parseOldCookies(API_KEY, { disableCookies: true });
      expect(cookies).toEqual({
        optOut: false,
      });
    });

    test('should handle non-persistent storage', () => {
      jest.spyOn(LocalStorageModule, 'LocalStorage').mockReturnValueOnce({
        isEnabled: () => false,
        get: () => ({}),
        getRaw: () => '',
        set: () => undefined,
        remove: () => undefined,
        reset: () => undefined,
      });
      const cookies = parseOldCookies(API_KEY, { disableCookies: true });
      expect(cookies).toEqual({
        optOut: false,
      });
    });

    test('should old cookies', () => {
      const timestamp = 1650949309508;
      const time = timestamp.toString(32);
      const userId = 'userId';
      const encodedUserId = btoa(unescape(encodeURIComponent(userId)));
      document.cookie = `${getOldCookieName(API_KEY)}=deviceId.${encodedUserId}..${time}.${time}`;
      const cookies = parseOldCookies(API_KEY);
      expect(cookies).toEqual({
        deviceId: 'deviceId',
        userId: 'userId',
        sessionId: timestamp,
        lastEventTime: timestamp,
        optOut: false,
      });
    });
  });

  describe('parseTime', () => {
    test('should parse time', () => {
      const timestamp = Date.now();
      const base32 = timestamp.toString(32);
      expect(parseTime(base32)).toBe(timestamp);
    });

    test('should handle invalid values', () => {
      expect(parseTime('')).toBe(undefined);
    });
  });

  describe('decode', () => {
    test('should decode value', () => {
      expect(decode('YXNkZg==')).toBe('asdf');
    });

    test('should handle incorrecty encoded value', () => {
      expect(decode('asdf')).toBe(undefined);
    });

    test('should handle undefined input', () => {
      expect(decode(undefined)).toBe(undefined);
    });
  });
});
