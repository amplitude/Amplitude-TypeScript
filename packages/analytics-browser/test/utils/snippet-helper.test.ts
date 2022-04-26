import { PluginType, QueueProxy } from '@amplitude/analytics-types';
import { convertProxyObjectToRealObject, isInstanceProxy, runQueuedFunctions } from '../../src/utils/snippet-helper';
import * as core from '@amplitude/analytics-core';
import { init, add, remove, track, identify, groupIdentify, setGroup, revenue } from '../../src/browser-client';
import * as CookieMigration from '../../src/cookie-migration';

describe('snippet-helper', () => {
  const API_KEY = 'apiKey';

  describe('runQueuedFunctions', () => {
    test('should run queued functions', () => {
      const _init = jest.spyOn(core, 'init');
      const parseOldCookies = jest.spyOn(CookieMigration, 'parseOldCookies').mockReturnValueOnce({
        optOut: false,
      });
      const proxyObj = { name: 'init', args: [API_KEY], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      runQueuedFunctions({ init }, queue);
      expect(_init).toHaveBeenCalledTimes(1);
      expect(parseOldCookies).toHaveBeenCalledTimes(1);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });

    test('should call core.add', () => {
      const _add = jest.spyOn(core, 'add').mockReturnValueOnce(Promise.resolve());
      const plugin = {
        name: 'plugin',
        type: PluginType.DESTINATION,
        setup: jest.fn(),
        execute: jest.fn(),
      };
      const proxyObj = { name: 'add', args: [plugin], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      runQueuedFunctions({ add }, queue);
      expect(_add).toHaveBeenCalledTimes(1);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });

    test('should call core.remove', () => {
      const _remove = jest.spyOn(core, 'remove').mockReturnValueOnce(Promise.resolve());
      const pluginName = 'plugin';
      const proxyObj = { name: 'remove', args: [pluginName], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      runQueuedFunctions({ remove }, queue);
      expect(_remove).toHaveBeenCalledTimes(1);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });

    test('should call core.track', () => {
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
      const proxyObj = { name: 'track', args: [event.event_type], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      runQueuedFunctions({ track }, queue);
      expect(_track).toHaveBeenCalledTimes(1);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });

    test('should call core.identify', () => {
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
      const proxyObj = { name: 'identify', args: [id], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      runQueuedFunctions({ identify }, queue);
      expect(coreIdentify).toHaveBeenCalledTimes(1);
      expect(coreIdentify).toHaveBeenCalledWith(undefined, undefined, id, undefined);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });

    test('should call core.groupIdentify', () => {
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
      const proxyObj = { name: 'groupIdentify', args: ['type', 'name', id], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      runQueuedFunctions({ groupIdentify }, queue);
      expect(coreIdentify).toHaveBeenCalledTimes(1);
      expect(coreIdentify).toHaveBeenCalledWith(undefined, undefined, 'type', 'name', id, undefined);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });

    test('should call core.setGroup', () => {
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
      const proxyObj = { name: 'setGroup', args: ['groupType', 'groupname'], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      runQueuedFunctions({ setGroup }, queue);
      expect(_setGroup).toHaveBeenCalledTimes(1);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });

    test('should call core.revenue', () => {
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
      const proxyObj = { name: 'revenue', args: [revenueObj], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      runQueuedFunctions({ revenue }, queue);
      expect(coreRevenue).toHaveBeenCalledTimes(1);
      expect(coreRevenue).toHaveBeenCalledWith(revenueObj, undefined);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });
  });

  describe('convertProxyObjectToRealObject', () => {
    test('should convert proxy object to real object', () => {
      const proxyObj = { name: 'init', args: [], resolve: () => undefined };
      const proxyResolve = jest.spyOn(proxyObj, 'resolve');
      const queue: QueueProxy = [proxyObj];
      convertProxyObjectToRealObject({ init: () => null }, queue);
      expect(proxyResolve).toHaveBeenCalledWith(undefined);
      expect(proxyResolve).toHaveBeenCalledTimes(1);
    });
  });

  describe('isInstanceProxy', () => {
    test('should return true if instance has _q', () => {
      expect(isInstanceProxy({ _q: [] })).toBe(true);
    });

    test('should return false if instance does not have _q', () => {
      expect(isInstanceProxy({})).toBe(false);
    });
  });
});
