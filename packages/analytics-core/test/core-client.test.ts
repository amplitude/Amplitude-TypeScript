import { Event, Plugin, PluginType, Config as IConfig, Status } from '@amplitude/analytics-types';
import { Identify, Revenue } from '../src/index';

import * as Config from '../src/config';
import * as client from '../src/core-client';
import * as timeline from '../src/timeline';
import { USER_ID, DEVICE_ID, useDefaultConfig } from './helpers/default';

describe('core-client', () => {
  const success = { statusCode: 200, status: Status.Success };
  const failed = { statusCode: 0, status: Status.Unknown };

  describe('init', () => {
    afterEach(() => {
      Config.resetInstances();
    });

    test('should call init', () => {
      const create = jest.spyOn(Config, 'createConfig');
      client.init(useDefaultConfig());
      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  describe('track', () => {
    test('should call track', async () => {
      const get = jest.spyOn(Config, 'getConfig');
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const eventType = 'eventType';
      const response = await client.track(eventType);
      expect(response).toEqual(success);
      expect(get).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('identify', () => {
    test('should call identify', async () => {
      const get = jest.spyOn(Config, 'getConfig');
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const identify: Identify = new Identify();
      const response = await client.identify(USER_ID, DEVICE_ID, identify);
      expect(response).toEqual(success);
      expect(get).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('groupIdentify', () => {
    test('should call groupIdentify', async () => {
      const get = jest.spyOn(Config, 'getConfig');
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const identify = new Identify();
      const response = await client.groupIdentify(USER_ID, DEVICE_ID, 'groupType', 'groupName', identify);
      expect(response).toEqual(success);
      expect(get).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('revenue', () => {
    test('should call revenue', async () => {
      const get = jest.spyOn(Config, 'getConfig');
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const revenue = new Revenue();
      const response = await client.revenue(revenue);
      expect(response).toEqual(success);
      expect(get).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('add/remove', () => {
    test('should call add', async () => {
      const register = jest.spyOn(timeline, 'register').mockReturnValueOnce(Promise.resolve());
      const deregister = jest.spyOn(timeline, 'deregister').mockReturnValueOnce(Promise.resolve());
      const setup = jest.fn();
      const execute = jest.fn();
      const plugin: Plugin = {
        name: 'plugin',
        type: PluginType.BEFORE,
        setup: setup,
        execute: execute,
      };

      // add
      await client.add([plugin]);
      expect(register).toBeCalledTimes(1);

      // remove
      await client.remove([plugin.name]);
      expect(deregister).toBeCalledTimes(1);
    });
  });

  describe('dispatch', () => {
    test('should handle success', async () => {
      const push = jest.spyOn(timeline, 'push').mockReturnValueOnce(Promise.resolve(success));
      const event: Event = {
        event_type: 'event_type',
      };
      const config: IConfig = useDefaultConfig();

      const result = await client.dispatch(event, config);
      expect(result).toBe(success);
      expect(push).toBeCalledTimes(1);
    });

    test('should handle error', async () => {
      const push = jest.spyOn(timeline, 'push').mockImplementation(() => {
        throw new Error();
      });
      const event: Event = {
        event_type: 'event_type',
      };
      const config: IConfig = useDefaultConfig();

      const result = await client.dispatch(event, config);
      expect(result).toEqual(failed);
      expect(push).toBeCalledTimes(1);
    });
  });
});
