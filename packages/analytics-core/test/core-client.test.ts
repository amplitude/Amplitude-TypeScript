/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Event, Plugin, PluginType, Status } from '@amplitude/analytics-types';
import { AmplitudeCore, Identify, Revenue } from '../src/index';
import { useDefaultConfig } from './helpers/default';
import { CLIENT_NOT_INITIALIZED, OPT_OUT_MESSAGE } from '../src/messages';

describe('core-client', () => {
  const success = { event: { event_type: 'sample' }, code: 200, message: Status.Success };
  const badRequest = { event: { event_type: 'sample' }, code: 400, message: Status.Invalid };
  const client = new AmplitudeCore();

  describe('init', () => {
    test('should call init', async () => {
      expect(client.config).toBeUndefined();
      await (client as any)._init(useDefaultConfig());
      expect(client.config).toBeDefined();
    });
  });

  describe('track', () => {
    test('should call track', async () => {
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const eventType = 'eventType';
      const eventProperties = { event: 'test' };
      const response = await client.track(eventType, eventProperties).promise;
      expect(response).toEqual(success);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('identify', () => {
    test('should call identify', async () => {
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const identify: Identify = new Identify();
      const response = await client.identify(identify, undefined).promise;
      expect(response).toEqual(success);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('groupIdentify', () => {
    test('should call groupIdentify', async () => {
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const identify = new Identify();
      const response = await client.groupIdentify('groupType', 'groupName', identify, undefined).promise;
      expect(response).toEqual(success);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('setGroup', () => {
    test('should call setGroup', async () => {
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const response = await client.setGroup('groupType', 'groupName').promise;
      expect(response).toEqual(success);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('revenue', () => {
    test('should call revenue', async () => {
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const revenue = new Revenue();
      const response = await client.revenue(revenue).promise;
      expect(response).toEqual(success);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('add/remove', () => {
    test('should call add', async () => {
      const register = jest.spyOn(client.timeline, 'register').mockReturnValueOnce(Promise.resolve());
      const deregister = jest.spyOn(client.timeline, 'deregister').mockReturnValueOnce(Promise.resolve());
      const setup = jest.fn();
      const execute = jest.fn();
      const plugin: Plugin = {
        name: 'plugin',
        type: PluginType.BEFORE,
        setup: setup,
        execute: execute,
      };

      // add
      await client.add(plugin).promise;
      expect(register).toHaveBeenCalledTimes(1);

      // remove
      await client.remove(plugin.name).promise;
      expect(deregister).toHaveBeenCalledTimes(1);
    });

    test('should queue add/remove', async () => {
      const client = new AmplitudeCore();
      const register = jest.spyOn(client.timeline, 'register');
      const deregister = jest.spyOn(client.timeline, 'deregister');
      await client.add({
        name: 'example',
        type: PluginType.BEFORE,
        setup: jest.fn(),
        execute: jest.fn(),
      }).promise;
      await client.remove('example').promise;
      await (client as any)._init(useDefaultConfig());
      expect(register).toHaveBeenCalledTimes(1);
      expect(deregister).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispatchWithCallback', () => {
    test('should handle success', async () => {
      const push = jest.spyOn(client.timeline, 'push').mockReturnValueOnce(Promise.resolve(success));
      const event: Event = {
        event_type: 'event_type',
      };

      return new Promise<void>((resolve) => {
        client.dispatchWithCallback(event, (result) => {
          expect(result).toBe(success);
          expect(push).toHaveBeenCalledTimes(1);
          resolve();
        });
      });
    });

    test('should handle undefined config', async () => {
      const client = new AmplitudeCore();
      const event: Event = {
        event_type: 'event_type',
      };

      return new Promise<void>((resolve) => {
        client.dispatchWithCallback(event, (result) => {
          expect(result).toEqual({
            event,
            code: 0,
            message: CLIENT_NOT_INITIALIZED,
          });
          resolve();
        });
      });
    });
  });

  describe('dispatch', () => {
    test('should handle success', async () => {
      const push = jest.spyOn(client.timeline, 'push').mockReturnValueOnce(Promise.resolve(success));
      const event: Event = {
        event_type: 'event_type',
      };

      const result = await client.dispatch(event);
      expect(result).toBe(success);
      expect(push).toHaveBeenCalledTimes(1);
    });

    test('should handle non-200 error', async () => {
      const push = jest.spyOn(client.timeline, 'push').mockReturnValueOnce(Promise.resolve(badRequest));
      const event: Event = {
        event_type: 'event_type',
      };

      const result = await client.dispatch(event);
      expect(result).toBe(badRequest);
      expect(push).toHaveBeenCalledTimes(1);
    });

    test('should handle unexpected error', async () => {
      const push = jest.spyOn(client.timeline, 'push').mockImplementation(() => {
        throw new Error();
      });
      const event: Event = {
        event_type: 'event_type',
      };

      const result = await client.dispatch(event);
      expect(result).toEqual({
        event,
        message: 'Error',
        code: 0,
      });
      expect(push).toHaveBeenCalledTimes(1);
    });

    test('should handle opt out', async () => {
      const push = jest.spyOn(client.timeline, 'push').mockReturnValueOnce(Promise.resolve(success));
      const event: Event = {
        event_type: 'event_type',
      };

      client.setOptOut(true);
      const result = await client.dispatch(event);
      expect(result).toEqual({
        event,
        message: OPT_OUT_MESSAGE,
        code: 0,
      });
      expect(push).toHaveBeenCalledTimes(0);
    });

    test('should handle undefined config', async () => {
      const client = new AmplitudeCore();
      const push = jest.spyOn(client.timeline, 'push').mockReturnValueOnce(Promise.resolve(success));
      const event: Event = {
        event_type: 'event_type',
      };

      const dispathPromise = client.dispatch(event);
      await (client as any)._init(useDefaultConfig());
      await client.runQueuedFunctions('dispatchQ');
      const result = await dispathPromise;
      expect(push).toHaveBeenCalledTimes(1);
      expect(result).toBe(success);
    });
  });

  describe('setOptOut', () => {
    test('should update opt out value', () => {
      client.setOptOut(true);
      expect(client.config.optOut).toBe(true);
    });

    test('should defer update opt out value', async () => {
      const client = new AmplitudeCore();
      client.setOptOut(true);
      await (client as any)._init(useDefaultConfig());
      expect(client.config.optOut).toBe(true);
    });
  });

  describe('flush', () => {
    test('should call flush', async () => {
      const flush = jest.spyOn(client.timeline, 'flush').mockReturnValueOnce(Promise.resolve());
      const setup = jest.fn();
      const execute = jest.fn();
      const plugin: Plugin = {
        name: 'plugin',
        type: PluginType.DESTINATION,
        setup: setup,
        execute: execute,
      };

      // add
      await client.add(plugin).promise;
      await client.flush().promise;
      expect(flush).toHaveBeenCalledTimes(1);
    });
  });
});
