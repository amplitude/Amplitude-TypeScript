/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Event, Plugin, Status } from '@amplitude/analytics-types';
import { AmplitudeCore, Identify, Revenue } from '../src/index';
import { CLIENT_NOT_INITIALIZED, OPT_OUT_MESSAGE } from '../src/messages';
import { useDefaultConfig } from './helpers/default';
async function runScheduleTimers() {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  await new Promise(process.nextTick);
  jest.runAllTimers();
}
describe('core-client', () => {
  const success = { event: { event_type: 'sample' }, code: 200, message: Status.Success };
  const badRequest = { event: { event_type: 'sample' }, code: 400, message: Status.Invalid };
  const continueRequest = { event: { event_type: 'sample' }, code: 100, message: Status.Unknown };
  const client = new AmplitudeCore();

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
        type: 'before',
        setup: setup,
        execute: execute,
      };

      // add
      await client.add(plugin).promise;
      expect(register).toHaveBeenCalledTimes(1);

      // remove
      await client.remove('plugin').promise;
      expect(deregister).toHaveBeenCalledTimes(1);
    });

    test('should queue add/remove', async () => {
      const client = new AmplitudeCore();
      const register = jest.spyOn(client.timeline, 'register');
      const deregister = jest.spyOn(client.timeline, 'deregister');
      await client.add({
        name: 'example',
        type: 'before',
        setup: jest.fn(),
        execute: jest.fn(),
      }).promise;
      await client.remove('example').promise;
      await (client as any)._init(useDefaultConfig());
      expect(register).toHaveBeenCalledTimes(1);
      expect(deregister).toHaveBeenCalledTimes(1);
    });

    test('should queue promises in correct order', async () => {
      function sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }
      const client = new AmplitudeCore();
      const register = jest.spyOn(client.timeline, 'register');
      const setupMockResolve = Promise.resolve();
      const setupMock = jest.fn().mockResolvedValue(setupMockResolve);
      await client.add({
        name: 'firstPlugin',
        type: 'before',
        setup: async () => {
          await sleep(10);
          setupMock('firstPlugin');
          return;
        },
        execute: jest.fn(),
      }).promise;
      client.add({
        name: 'secondPlugin',
        type: 'before',
        setup: async () => {
          setupMock('secondPlugin');
          return;
        },
        execute: jest.fn(),
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const initPromise = (client as any)._init(useDefaultConfig());
      await runScheduleTimers();
      await initPromise;
      await setupMockResolve;
      expect(register).toHaveBeenCalledTimes(2);
      expect(setupMock).toHaveBeenCalledTimes(2);
      expect(setupMock.mock.calls[0][0]).toEqual('firstPlugin');
      expect(setupMock.mock.calls[1][0]).toEqual('secondPlugin');
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

    test('should handle warning', async () => {
      const push = jest.spyOn(client.timeline, 'push').mockReturnValueOnce(Promise.resolve(continueRequest));
      const event: Event = {
        event_type: 'event_type',
      };

      const result = await client.dispatch(event);
      expect(result).toBe(continueRequest);
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
        type: 'destination',
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
