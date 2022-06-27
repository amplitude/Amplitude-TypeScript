import { MemoryStorage } from '@amplitude/analytics-core';
import { UserSession } from '@amplitude/analytics-types';
import { SessionManager } from '../src/session-manager';
import { API_KEY } from './helpers/default';

describe('session-manager', () => {
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
    test('should set/get last event time', async () => {
      const sessionManager = await new SessionManager(new MemoryStorage(), API_KEY).load();
      sessionManager.setOptOut(true);
      expect(sessionManager.getOptOut()).toBe(true);
    });
  });
});
