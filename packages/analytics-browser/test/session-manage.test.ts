import { MemoryStorage } from '@amplitude/analytics-core';
import { UserSession } from '@amplitude/analytics-types';
import { SessionManager } from '../src/session-manager';
import { API_KEY } from './helpers/default';

describe('session-manager', () => {
  describe('setSession', () => {
    test('should set session', () => {
      const storage = new MemoryStorage<UserSession>();
      const set = jest.spyOn(storage, 'set');
      const sessionManager = new SessionManager(storage, {
        apiKey: API_KEY,
        sessionTimeout: 1,
      });
      sessionManager.setSession({ sessionId: 1 });
      expect(set).toHaveBeenCalledTimes(1);
      expect(sessionManager.cache.sessionId).toBe(1);
    });
  });

  describe('setSessionId/getSessionId', () => {
    test('should set/get session id', () => {
      const sessionManager = new SessionManager(new MemoryStorage(), {
        apiKey: API_KEY,
        sessionTimeout: 1,
      });
      expect(sessionManager.getSessionId()).toBe(undefined);
      sessionManager.setSessionId(1);
      expect(sessionManager.getSessionId()).toBe(1);
    });
  });

  describe('setDeviceId/getDeviceId', () => {
    test('should set/get device id', () => {
      const sessionManager = new SessionManager(new MemoryStorage(), {
        apiKey: API_KEY,
        sessionTimeout: 1,
      });
      sessionManager.setDeviceId('deviceId');
      expect(sessionManager.getDeviceId()).toBe('deviceId');
    });
  });

  describe('setUserId/getUserId', () => {
    test('should set/get user id', () => {
      const sessionManager = new SessionManager(new MemoryStorage(), {
        apiKey: API_KEY,
        sessionTimeout: 1,
      });
      sessionManager.setUserId('userId');
      expect(sessionManager.getUserId()).toBe('userId');
    });
  });

  describe('setLastEventTime/getLastEventTime', () => {
    test('should set/get last event time', () => {
      const sessionManager = new SessionManager(new MemoryStorage(), {
        apiKey: API_KEY,
        sessionTimeout: 1,
      });
      const time = Date.now();
      sessionManager.setLastEventTime(time);
      expect(sessionManager.getLastEventTime()).toBe(time);
    });
  });

  describe('setOptOut/getOptOut', () => {
    test('should set/get last event time', () => {
      const sessionManager = new SessionManager(new MemoryStorage(), {
        apiKey: API_KEY,
        sessionTimeout: 1,
      });
      sessionManager.setOptOut(true);
      expect(sessionManager.getOptOut()).toBe(true);
    });
  });
});
