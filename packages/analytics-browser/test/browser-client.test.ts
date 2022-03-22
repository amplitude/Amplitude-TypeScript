import { init, setUserId, setDeviceId, setSessionId, setOptOut } from '../src/browser-client';
import * as core from '@amplitude/analytics-core';
import * as Config from '../src/config';
import * as SessionManager from '../src/session-manager';
import * as attribution from '../src/attribution';

describe('browser-client', () => {
  const API_KEY = 'apiKey';
  const USER_ID = 'userId';

  describe('init', () => {
    test('should call core init', () => {
      const _init = jest.spyOn(core, 'init').mockReturnValueOnce(Config.createConfig(API_KEY));
      const _add = jest
        .spyOn(core, 'add')
        .mockReturnValueOnce(Promise.resolve())
        .mockReturnValueOnce(Promise.resolve());
      const trackAttributions = jest.spyOn(attribution, 'trackAttributions').mockReturnValueOnce();
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      init(API_KEY, USER_ID);
      expect(_init).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(_add).toHaveBeenCalledTimes(2);
      expect(trackAttributions).toHaveBeenCalledTimes(1);
    });
  });

  describe('setUserId', () => {
    test('should update user id', () => {
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
    test('should update device id', () => {
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
    test('should update session id', () => {
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

  describe('setOptOut', () => {
    test('should update opt out config', () => {
      const config = Config.createConfig(API_KEY);
      const getConfig = jest.spyOn(Config, 'getConfig').mockReturnValueOnce(config);
      const _setOptOut = jest.spyOn(core, 'setOptOut').mockImplementationOnce((optOut: boolean) => {
        config.optOut = Boolean(optOut);
      });
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      setOptOut(true);
      expect(getConfig).toHaveBeenCalledTimes(1);
      expect(_setOptOut).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenLastCalledWith({
        ...config,
        optOut: true,
      });
    });
  });
});
