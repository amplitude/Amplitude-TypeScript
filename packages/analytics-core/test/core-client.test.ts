import { Event, Plugin, PluginType, Config } from '@amplitude/analytics-types';
import * as ConfigFactory from '../src/config';
import * as client from '../src/core-client';
import * as timeline from '../src/timeline';

describe('core-client', () => {
  const API_KEY = 'apikey';
  const USER_ID = 'userid';
  const success = {
    success: true,
    code: 200,
    message: 'success',
  };
  const failed = {
    success: false,
    code: 500,
    message: 'failed',
  };

  describe('init', () => {
    test('should call init', () => {
      const create = jest.spyOn(ConfigFactory, 'createConfig');
      client.init(API_KEY, USER_ID);
      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  describe('track', () => {
    test('should call track', async () => {
      const get = jest.spyOn(ConfigFactory, 'getConfig');
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
      const get = jest.spyOn(ConfigFactory, 'getConfig');
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const response = await client.identify();
      expect(response).toEqual(success);
      expect(get).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('groupIdentify', () => {
    test('should call groupIdentify', async () => {
      const get = jest.spyOn(ConfigFactory, 'getConfig');
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const response = await client.groupIdentify();
      expect(response).toEqual(success);
      expect(get).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('revenue', () => {
    test('should call revenue', async () => {
      const get = jest.spyOn(ConfigFactory, 'getConfig');
      const dispatch = jest.spyOn(client, 'dispatch').mockReturnValueOnce(Promise.resolve(success));
      const response = await client.revenue();
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
      const config: Config = ConfigFactory.createConfig('apikey', 'userid');

      const result = await client.dispatch(event, config);
      expect(result).toBe(success);
      expect(push).toBeCalledTimes(1);
    });

    test('should handle error', async () => {
      const push = jest.spyOn(timeline, 'push').mockReturnValueOnce(Promise.reject());
      const event: Event = {
        event_type: 'event_type',
      };
      const config: Config = ConfigFactory.createConfig('apikey', 'userid');

      const result = await client.dispatch(event, config);
      expect(result).toEqual(failed);
      expect(push).toBeCalledTimes(1);
    });
  });
});
