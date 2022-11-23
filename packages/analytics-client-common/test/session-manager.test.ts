import { MemoryStorage } from '@amplitude/analytics-core';
import { UserSession } from '@amplitude/analytics-types';
import { SessionManager } from '../src/session-manager';
import { API_KEY } from './helpers/constants';

describe('session-manager', () => {
  describe('load', () => {
    test('should use persisted session value', async () => {
      const storage = new MemoryStorage<UserSession>();
      const get = jest.spyOn(storage, 'get').mockReturnValueOnce(
        Promise.resolve({
          optOut: true,
        }),
      );
      const sessionManager = await new SessionManager(storage, API_KEY).load();
      expect(sessionManager.cache).toEqual({
        optOut: true,
      });
      expect(get).toHaveBeenCalledTimes(1);
    });

    test('should use default session value', async () => {
      const storage = new MemoryStorage<UserSession>();
      const get = jest.spyOn(storage, 'get').mockReturnValueOnce(Promise.resolve(undefined));
      const sessionManager = await new SessionManager(storage, API_KEY).load();
      expect(sessionManager.cache).toEqual({
        optOut: false,
      });
      expect(get).toHaveBeenCalledTimes(1);
    });
  });

  describe('setSession', () => {
    test('should set session', async () => {
      const storage = new MemoryStorage<UserSession>();
      const set = jest.spyOn(storage, 'set');
      const sessionManager = await new SessionManager(storage, API_KEY).load();
      sessionManager.setSession({ sessionId: 1 });
      expect(set).toHaveBeenCalledTimes(1);
      expect(sessionManager.cache.sessionId).toBe(1);
    });
  });

  describe('setSessionId/getSessionId', () => {
    test('should set/get session id', async () => {
      const sessionManager = await new SessionManager(new MemoryStorage(), API_KEY).load();
      expect(sessionManager.getSessionId()).toBe(undefined);
      sessionManager.setSessionId(1);
      expect(sessionManager.getSessionId()).toBe(1);
    });
  });

  describe('setDeviceId/getDeviceId', () => {
    test('should set/get device id', async () => {
      const sessionManager = await new SessionManager(new MemoryStorage(), API_KEY).load();
      sessionManager.setDeviceId('deviceId');
      expect(sessionManager.getDeviceId()).toBe('deviceId');
    });
  });

  describe('setUserId/getUserId', () => {
    test('should set/get user id', async () => {
      const sessionManager = await new SessionManager(new MemoryStorage(), API_KEY).load();
      sessionManager.setUserId('userId');
      expect(sessionManager.getUserId()).toBe('userId');
    });
  });

  describe('setLastEventTime/getLastEventTime', () => {
    test('should set/get last event time', async () => {
      const sessionManager = await new SessionManager(new MemoryStorage(), API_KEY).load();
      const time = Date.now();
      sessionManager.setLastEventTime(time);
      expect(sessionManager.getLastEventTime()).toBe(time);
    });
  });

  describe('setOptOut/getOptOut', () => {
    test('should set/get OptOut', async () => {
      const sessionManager = await new SessionManager(new MemoryStorage(), API_KEY).load();
      sessionManager.setOptOut(true);
      expect(sessionManager.getOptOut()).toBe(true);
    });
  });

  describe('setLastEventId/getLastEventId', () => {
    test('should set/get last event id', async () => {
      const sessionManager = await new SessionManager(new MemoryStorage(), API_KEY).load();
      expect(sessionManager.getLastEventId()).toBeUndefined();
      sessionManager.setLastEventId(12345);
      expect(sessionManager.getLastEventId()).toBe(12345);
    });
  });
});
