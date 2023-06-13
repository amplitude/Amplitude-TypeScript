import { CookieStorage, getOldCookieName } from '@amplitude/analytics-client-common';
import { Storage, UserSession } from '@amplitude/analytics-types';
import { decode, parseLegacyCookies, parseTime } from '../../src/cookie-migration';
import * as LocalStorageModule from '../../src/storage/local-storage';
import { MemoryStorage } from '@amplitude/analytics-core';

describe('cookie-migration', () => {
  const API_KEY = 'asdfasdf';
  afterEach(() => {
    // clean up cookies
    document.cookie = `${getOldCookieName(API_KEY)}=null; expires=-1`;
  });

  describe('parseLegacyCookies', () => {
    test('should return default values', async () => {
      const cookies = await parseLegacyCookies(API_KEY, new MemoryStorage());
      expect(cookies).toEqual({
        optOut: false,
      });
    });

    test('should handle non-persistent storage', async () => {
      jest.spyOn(LocalStorageModule, 'LocalStorage').mockReturnValueOnce({
        isEnabled: async () => false,
        get: async () => ({}),
        getRaw: async () => '',
        set: async () => undefined,
        remove: async () => undefined,
        reset: async () => undefined,
      });
      const cookies = await parseLegacyCookies(API_KEY, new MemoryStorage());
      expect(cookies).toEqual({
        optOut: false,
      });
    });

    test('should remove old cookies by default', async () => {
      const timestamp = 1650949309508;
      const time = timestamp.toString(32);
      const userId = 'userId';
      const encodedUserId = btoa(unescape(encodeURIComponent(userId)));
      const oldCookieName = getOldCookieName(API_KEY);
      const lastEventId = (0).toString(32);
      document.cookie = `${oldCookieName}=deviceId.${encodedUserId}..${time}.${time}.${lastEventId}`;
      const cookieStorage: Storage<UserSession> = new CookieStorage<UserSession>();
      const cookies = await parseLegacyCookies(API_KEY, cookieStorage);
      expect(cookies).toEqual({
        deviceId: 'deviceId',
        userId: 'userId',
        sessionId: timestamp,
        lastEventId: 0,
        lastEventTime: timestamp,
        optOut: false,
      });
      const cookies2 = await cookieStorage.getRaw(oldCookieName);
      expect(cookies2).toBeUndefined();
    });

    test('should remove old cookies', async () => {
      const timestamp = 1650949309508;
      const time = timestamp.toString(32);
      const userId = 'userId';
      const encodedUserId = btoa(unescape(encodeURIComponent(userId)));
      const oldCookieName = getOldCookieName(API_KEY);
      const lastEventId = (0).toString(32);
      document.cookie = `${oldCookieName}=deviceId.${encodedUserId}..${time}.${time}.${lastEventId}`;
      const cookieStorage: Storage<UserSession> = new CookieStorage<UserSession>();
      const cookies = await parseLegacyCookies(API_KEY, cookieStorage, true);
      expect(cookies).toEqual({
        deviceId: 'deviceId',
        userId: 'userId',
        sessionId: timestamp,
        lastEventTime: timestamp,
        lastEventId: 0,
        optOut: false,
      });

      const storage: Storage<string> = new CookieStorage<string>();
      const cookies2 = await storage.getRaw(oldCookieName);
      expect(cookies2).toBeUndefined();
    });

    test('should keep old cookies', async () => {
      const timestamp = 1650949309508;
      const time = timestamp.toString(32);
      const userId = 'userId';
      const encodedUserId = btoa(unescape(encodeURIComponent(userId)));
      const oldCookieName = getOldCookieName(API_KEY);
      const lastEventId = (0).toString(32);
      document.cookie = `${oldCookieName}=deviceId.${encodedUserId}..${time}.${time}.${lastEventId}`;
      const cookieStorage: Storage<UserSession> = new CookieStorage<UserSession>();
      const cookies = await parseLegacyCookies(API_KEY, cookieStorage, false);
      expect(cookies).toEqual({
        deviceId: 'deviceId',
        userId: 'userId',
        sessionId: timestamp,
        lastEventTime: timestamp,
        lastEventId: 0,
        optOut: false,
      });

      const storage: Storage<string> = new CookieStorage<string>();
      const cookies2 = await storage.getRaw(oldCookieName);
      expect(cookies2).toBe(`deviceId.${encodedUserId}..${time}.${time}.${lastEventId}`);
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
