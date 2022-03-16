import { init, setUserId, setDeviceId, setSessionId } from '../src/browser-client';
import * as core from '@amplitude/analytics-core';
import * as Config from '../src/config';
import * as SessionManager from '../src/session-manager';

describe('browser-client', () => {
  const API_KEY = 'apiKey';
  const USER_ID = 'userId';

  describe('init', () => {
    test('should call core init', () => {
      const _init = jest.spyOn(core, 'init').mockReturnValueOnce(Config.createConfig(API_KEY));
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      init(API_KEY, USER_ID);
      expect(_init).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
    });
  });

  describe('setUserId', () => {
    test('shoud update user id', () => {
      const config = Config.createConfig(API_KEY);
      const getConfig = jest.spyOn(Config, 'getConfig').mockReturnValueOnce(config);
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      setUserId('userId');
      expect(getConfig).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenLastCalledWith({
        ...config,
        userId: 'userId',
      });
    });
  });

  describe('setDeviceId', () => {
    test('shoud update device id', () => {
      const config = Config.createConfig(API_KEY);
      const getConfig = jest.spyOn(Config, 'getConfig').mockReturnValueOnce(config);
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      setDeviceId('deviceId');
      expect(getConfig).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenLastCalledWith({
        ...config,
        deviceId: 'deviceId',
      });
    });
  });

  describe('setSessionId', () => {
    test('shoud update session id', () => {
      const config = Config.createConfig(API_KEY);
      const getConfig = jest.spyOn(Config, 'getConfig').mockReturnValueOnce(config);
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      setSessionId(1);
      expect(getConfig).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenLastCalledWith({
        ...config,
        sessionId: 1,
      });
    });
  });
});
