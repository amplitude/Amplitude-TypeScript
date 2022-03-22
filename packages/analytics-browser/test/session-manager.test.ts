import { BrowserConfig } from '@amplitude/analytics-types';
import { createConfig } from '../src/config';
import { getCookieName, updateCookies, updateLastEventTime } from '../src/session-manager';

describe('session-mananger', () => {
  describe('updateCookies', () => {
    test('should update browser cookies', () => {
      const now = Date.now();
      const cookieStorage = {
        isEnabled: () => true,
        get: jest.fn().mockReturnValueOnce({
          lastEventTime: now,
        }),
        set: jest.fn(),
        remove: jest.fn(),
        reset: jest.fn(),
      };
      const config: BrowserConfig = {
        ...createConfig('apiKey', 'userId'),
        deviceId: 'deviceId',
        sessionId: 0,
        cookieStorage,
      };
      updateCookies(config);
      expect(cookieStorage.set).toHaveBeenCalledTimes(1);
      expect(cookieStorage.set).toHaveBeenLastCalledWith(getCookieName('apiKey'), {
        userId: 'userId',
        deviceId: 'deviceId',
        sessionId: 0,
        lastEventTime: now,
        optOut: false,
      });
    });

    test('should update browser cookies without existing cookies', () => {
      const cookieStorage = {
        isEnabled: () => true,
        get: jest.fn().mockReturnValueOnce(undefined),
        set: jest.fn(),
        remove: jest.fn(),
        reset: jest.fn(),
      };
      const config: BrowserConfig = {
        ...createConfig('apiKey', 'userId'),
        deviceId: 'deviceId',
        sessionId: 0,
        cookieStorage,
      };
      updateCookies(config);
      expect(cookieStorage.set).toHaveBeenCalledTimes(1);
      expect(cookieStorage.set).toHaveBeenLastCalledWith(getCookieName('apiKey'), {
        userId: 'userId',
        deviceId: 'deviceId',
        sessionId: 0,
        lastEventTime: undefined,
        optOut: false,
      });
    });
  });

  describe('updateLastEventTime', () => {
    test('should update last event time', () => {
      const cookieStorage = {
        isEnabled: () => true,
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
        reset: jest.fn(),
      };
      const config: BrowserConfig = {
        ...createConfig('apiKey', 'userId'),
        deviceId: 'deviceId',
        sessionId: 0,
        cookieStorage,
      };
      const now = Date.now();
      updateLastEventTime(config, now);
      expect(cookieStorage.set).toHaveBeenCalledTimes(1);
      expect(cookieStorage.set).toHaveBeenLastCalledWith(getCookieName('apiKey'), {
        userId: 'userId',
        deviceId: 'deviceId',
        sessionId: 0,
        lastEventTime: now,
        optOut: false,
      });
    });
  });

  describe('getCookieName', () => {
    test('should return cookie name', () => {
      expect(getCookieName('apiKey')).toBe('AMP_apiKey');
    });
  });
});
