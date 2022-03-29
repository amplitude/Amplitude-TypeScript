import type { AmplitudeProxy } from 'src/typings/browser-snippet';
import {
  init,
  groupIdentify,
  identify,
  revenue,
  setUserId,
  setDeviceId,
  setSessionId,
  setOptOut,
  runQueuedFunctions,
} from '../src/browser-client';
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

  describe('identify', () => {
    test('should call core identify', async () => {
      const coreIdentify = jest.spyOn(core, 'identify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          code: 200,
          message: 'Success',
        }),
      );
      const id = new core.Identify();
      await identify(id);
      expect(coreIdentify).toHaveBeenCalledTimes(1);
      expect(coreIdentify).toHaveBeenCalledWith(undefined, undefined, id, undefined);
    });

    test('should allow event options', async () => {
      const coreIdentify = jest.spyOn(core, 'identify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          code: 200,
          message: 'Success',
        }),
      );
      const id = new core.Identify();
      await identify(id, {});
      expect(coreIdentify).toHaveBeenCalledTimes(1);
      expect(coreIdentify).toHaveBeenCalledWith(undefined, undefined, id, {});
    });

    test('should allow identify snippet proxy', async () => {
      const coreIdentify = jest.spyOn(core, 'identify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          code: 200,
          message: 'Success',
        }),
      );
      const id = { _q: [] };
      await identify(id);
      expect(coreIdentify).toHaveBeenCalledTimes(1);
      expect(coreIdentify).toHaveBeenCalledWith(undefined, undefined, expect.any(core.Identify), undefined);
    });
  });

  describe('groupIdentify', () => {
    test('should call core groupIdentify', async () => {
      const coreIdentify = jest.spyOn(core, 'groupIdentify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          code: 200,
          message: 'Success',
        }),
      );
      const id = new core.Identify();
      await groupIdentify('type', 'name', id);
      expect(coreIdentify).toHaveBeenCalledTimes(1);
      expect(coreIdentify).toHaveBeenCalledWith(undefined, undefined, 'type', 'name', id, undefined);
    });

    test('should allow event options', async () => {
      const coreIdentify = jest.spyOn(core, 'groupIdentify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          code: 200,
          message: 'Success',
        }),
      );
      const id = new core.Identify();
      await groupIdentify('type', 'name', id, {});
      expect(coreIdentify).toHaveBeenCalledTimes(1);
      expect(coreIdentify).toHaveBeenCalledWith(undefined, undefined, 'type', 'name', id, {});
    });

    test('should allow identify snippet proxy', async () => {
      const coreIdentify = jest.spyOn(core, 'groupIdentify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          code: 200,
          message: 'Success',
        }),
      );
      const id = { _q: [] };
      await groupIdentify('type', 'name', id);
      expect(coreIdentify).toHaveBeenCalledTimes(1);
      expect(coreIdentify).toHaveBeenCalledWith(
        undefined,
        undefined,
        'type',
        'name',
        expect.any(core.Identify),
        undefined,
      );
    });
  });

  describe('revenue', () => {
    test('should call core revenue', async () => {
      const coreRevenue = jest.spyOn(core, 'revenue').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          code: 200,
          message: 'Success',
        }),
      );
      const revenueObj = new core.Revenue();
      await revenue(revenueObj);
      expect(coreRevenue).toHaveBeenCalledTimes(1);
      expect(coreRevenue).toHaveBeenCalledWith(revenueObj, undefined);
    });

    test('should allow event options', async () => {
      const coreRevenue = jest.spyOn(core, 'revenue').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          code: 200,
          message: 'Success',
        }),
      );
      const revenueObj = new core.Revenue();
      await revenue(revenueObj, {});
      expect(coreRevenue).toHaveBeenCalledTimes(1);
      expect(coreRevenue).toHaveBeenCalledWith(revenueObj, {});
    });

    test('should allow revenue snippet proxy', async () => {
      const coreRevenue = jest.spyOn(core, 'revenue').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          code: 200,
          message: 'Success',
        }),
      );
      const revenueObj = { _q: [] };
      await revenue(revenueObj);
      expect(coreRevenue).toHaveBeenCalledTimes(1);
      expect(coreRevenue).toHaveBeenCalledWith(expect.any(core.Revenue), undefined);
    });
  });

  describe('runQueuedFunctions', () => {
    test('should run queued functions', () => {
      const windowAmplitudeInit = jest.spyOn(core, 'init');
      const amplitude = <AmplitudeProxy>(<unknown>{
        _q: <Array<[string, []]>>[],
        init: core.init,
      });
      const functions = [['init', API_KEY]];
      amplitude._q = <Array<[string, []]>>functions;
      expect(amplitude._q.length).toEqual(1);
      runQueuedFunctions(amplitude);
      expect(windowAmplitudeInit).toHaveBeenCalledTimes(1);
    });
  });
});
