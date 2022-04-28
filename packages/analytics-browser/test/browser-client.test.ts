import {
  init,
  groupIdentify,
  identify,
  revenue,
  setUserId,
  setDeviceId,
  setSessionId,
  setOptOut,
  getUserId,
  getDeviceId,
  getSessionId,
  add,
  remove,
  track,
  setGroup,
  setTransport,
} from '../src/browser-client';
import * as core from '@amplitude/analytics-core';
import * as Config from '../src/config';
import * as SessionManager from '../src/session-manager';
import * as CookieMigration from '../src/cookie-migration';
import * as attribution from '../src/attribution';
import { PluginType, TransportType } from '@amplitude/analytics-types';
import { XHRTransport } from '../src/transports/xhr';

describe('browser-client', () => {
  const API_KEY = 'apiKey';
  const USER_ID = 'userId';

  describe('init', () => {
    test('should call core init', async () => {
      const _init = jest.spyOn(core, 'init').mockReturnValueOnce(Config.createConfig(API_KEY));
      const parseOldCookie = jest.spyOn(CookieMigration, 'parseOldCookies').mockReturnValueOnce({
        optOut: false,
      });
      const _add = jest
        .spyOn(core, 'add')
        .mockReturnValueOnce(Promise.resolve())
        .mockReturnValueOnce(Promise.resolve());
      const trackAttributions = jest.spyOn(attribution, 'trackAttributions').mockReturnValueOnce();
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      await init(API_KEY, USER_ID).promise;
      expect(_init).toHaveBeenCalledTimes(1);
      expect(parseOldCookie).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(_add).toHaveBeenCalledTimes(2);
      expect(trackAttributions).toHaveBeenCalledTimes(1);
    });

    test('should call core init with custom config', async () => {
      const _init = jest.spyOn(core, 'init').mockReturnValueOnce(Config.createConfig(API_KEY));
      const parseOldCookie = jest.spyOn(CookieMigration, 'parseOldCookies').mockReturnValueOnce({
        optOut: false,
      });
      const _add = jest
        .spyOn(core, 'add')
        .mockReturnValueOnce(Promise.resolve())
        .mockReturnValueOnce(Promise.resolve());
      const trackAttributions = jest.spyOn(attribution, 'trackAttributions').mockReturnValueOnce();
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      await init(API_KEY, USER_ID, {
        deviceId: 'deviceId',
        sessionId: 1,
        optOut: false,
      }).promise;
      expect(_init).toHaveBeenCalledTimes(1);
      expect(parseOldCookie).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(_add).toHaveBeenCalledTimes(2);
      expect(trackAttributions).toHaveBeenCalledTimes(1);
    });

    test('should call core init with cookie config', async () => {
      const _init = jest.spyOn(core, 'init').mockReturnValueOnce(Config.createConfig(API_KEY));
      const parseOldCookie = jest.spyOn(CookieMigration, 'parseOldCookies').mockReturnValueOnce({
        deviceId: 'deviceId',
        sessionId: 1,
        optOut: false,
      });
      const _add = jest
        .spyOn(core, 'add')
        .mockReturnValueOnce(Promise.resolve())
        .mockReturnValueOnce(Promise.resolve());
      const trackAttributions = jest.spyOn(attribution, 'trackAttributions').mockReturnValueOnce();
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      await init(API_KEY, USER_ID).promise;
      expect(_init).toHaveBeenCalledTimes(1);
      expect(parseOldCookie).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(_add).toHaveBeenCalledTimes(2);
      expect(trackAttributions).toHaveBeenCalledTimes(1);
    });

    test('should call core init with no user id', async () => {
      const _init = jest.spyOn(core, 'init').mockReturnValueOnce(Config.createConfig(API_KEY));
      const parseOldCookie = jest.spyOn(CookieMigration, 'parseOldCookies').mockReturnValueOnce({
        optOut: false,
      });
      const _add = jest
        .spyOn(core, 'add')
        .mockReturnValueOnce(Promise.resolve())
        .mockReturnValueOnce(Promise.resolve());
      const trackAttributions = jest.spyOn(attribution, 'trackAttributions').mockReturnValueOnce();
      const updateCookies = jest.spyOn(SessionManager, 'updateCookies').mockReturnValueOnce(undefined);
      await init(API_KEY).promise;
      expect(_init).toHaveBeenCalledTimes(1);
      expect(parseOldCookie).toHaveBeenCalledTimes(1);
      expect(updateCookies).toHaveBeenCalledTimes(1);
      expect(_add).toHaveBeenCalledTimes(2);
      expect(trackAttributions).toHaveBeenCalledTimes(1);
    });
  });

  describe('add', () => {
    test('should call core.add', async () => {
      const _add = jest.spyOn(core, 'add').mockReturnValueOnce(Promise.resolve());
      const plugin = {
        name: 'plugin',
        type: PluginType.DESTINATION,
        setup: jest.fn(),
        execute: jest.fn(),
      };
      await add(plugin).promise;
      expect(_add).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    test('should call core.remove', async () => {
      const _remove = jest.spyOn(core, 'remove').mockReturnValueOnce(Promise.resolve());
      const pluginName = 'plugin';
      await remove(pluginName).promise;
      expect(_remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserId', () => {
    test('should return user id', () => {
      const config = Config.createConfig(API_KEY, 'userId');
      const getConfig = jest.spyOn(Config, 'getConfig').mockReturnValueOnce(config);
      expect(getUserId()).toBe('userId');
      expect(getConfig).toHaveBeenCalledTimes(1);
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

  describe('getDeviceId', () => {
    test('should return user id', () => {
      const config = Config.createConfig(API_KEY, '', { deviceId: 'deviceId' });
      const getConfig = jest.spyOn(Config, 'getConfig').mockReturnValueOnce(config);
      expect(getDeviceId()).toBe('deviceId');
      expect(getConfig).toHaveBeenCalledTimes(1);
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

  describe('getSessionId', () => {
    test('should return user id', () => {
      const config = Config.createConfig(API_KEY, '', { sessionId: 1 });
      const getConfig = jest.spyOn(Config, 'getConfig').mockReturnValueOnce(config);
      expect(getSessionId()).toBe(1);
      expect(getConfig).toHaveBeenCalledTimes(1);
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

  describe('setTransport', () => {
    test('should set transport', () => {
      const config = Config.createConfig(API_KEY);
      const getConfig = jest.spyOn(Config, 'getConfig').mockReturnValueOnce(config);
      const createTransport = jest.spyOn(Config, 'createTransport').mockReturnValueOnce(new XHRTransport());
      setTransport(TransportType.XHR);
      expect(getConfig).toHaveBeenCalledTimes(1);
      expect(createTransport).toHaveBeenCalledTimes(1);
      expect(config.transportProvider).toBeInstanceOf(XHRTransport);
    });
  });

  describe('track', () => {
    test('should call core.track', async () => {
      const event = {
        event_type: 'hello',
      };
      const _track = jest.spyOn(core, 'track').mockReturnValueOnce(
        Promise.resolve({
          event,
          code: 200,
          message: 'success',
        }),
      );
      await track(event.event_type).promise;
      expect(_track).toHaveBeenCalledTimes(1);
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
      await identify(id).promise;
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
      await identify(id, {}).promise;
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
      // Allow to pass snippet stub
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await identify(id).promise;
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
      await groupIdentify('type', 'name', id).promise;
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
      await groupIdentify('type', 'name', id, {}).promise;
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
      // Allow to pass snippet stub
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await groupIdentify('type', 'name', id).promise;
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

  describe('setGroup', () => {
    test('should call core.setGroup', async () => {
      const event = {
        event_type: 'hello',
      };
      const _setGroup = jest.spyOn(core, 'setGroup').mockReturnValueOnce(
        Promise.resolve({
          event,
          code: 200,
          message: 'success',
        }),
      );
      await setGroup('groupType', 'groupname').promise;
      expect(_setGroup).toHaveBeenCalledTimes(1);
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
      await revenue(revenueObj).promise;
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
      await revenue(revenueObj, {}).promise;
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
      // Allow to pass snippet stub
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await revenue(revenueObj).promise;
      expect(coreRevenue).toHaveBeenCalledTimes(1);
      expect(coreRevenue).toHaveBeenCalledWith(expect.any(core.Revenue), undefined);
    });
  });
});
