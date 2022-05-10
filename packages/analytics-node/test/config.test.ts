import * as Config from '../src/config';
import * as core from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-types';
import { createTransport } from '../src/config';

describe('config', () => {
  const API_KEY = 'apiKey';

  describe('NodeConfig', () => {
    test('should create overwrite config', () => {
      jest.spyOn(Config, 'createEventsStorage').mockReturnValueOnce(new core.MemoryStorage());
      jest.spyOn(Config, 'createDeviceId').mockReturnValueOnce('deviceId');
      jest.spyOn(Config, 'createSessionId').mockReturnValueOnce(0);
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = new Config.NodeConfig(API_KEY);
      expect(config).toEqual({
        apiKey: API_KEY,
        deviceId: undefined,
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 10,
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        optOut: false,
        partnerId: undefined,
        plugins: [],
        saveEvents: true,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        sessionId: undefined,
        storageProvider: new core.MemoryStorage(),
        transportProvider: new core.Http(),
        userId: undefined,
        useBatch: false,
      });
    });
  });

  describe('useNodeConfig', () => {
    test('should create default config', () => {
      jest.spyOn(Config, 'createEventsStorage').mockReturnValueOnce(new core.MemoryStorage());
      jest.spyOn(Config, 'createDeviceId').mockReturnValueOnce('deviceId');
      jest.spyOn(Config, 'createSessionId').mockReturnValueOnce(0);
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = Config.useNodeConfig(API_KEY, undefined);
      expect(config).toEqual({
        apiKey: API_KEY,
        deviceId: 'deviceId',
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 10,
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        optOut: false,
        partnerId: undefined,
        plugins: [],
        saveEvents: true,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        sessionId: 0,
        storageProvider: new core.MemoryStorage(),
        transportProvider: new core.Http(),
        userId: undefined,
        useBatch: false,
      });
    });
  });

  describe('createEventsStorage', () => {
    test('should return custom', () => {
      const storageProvider = {
        isEnabled: () => true,
        get: () => [],
        set: () => undefined,
        remove: () => undefined,
        reset: () => undefined,
        getRaw: () => undefined,
      };
      const storage = Config.createEventsStorage();
      expect(storage).toBe(storageProvider);
    });
  });

  describe('createDeviceId', () => {
    test('should return uuid', () => {
      const deviceId = Config.createDeviceId();
      expect(deviceId.substring(14, 15)).toEqual('4');
    });
  });

  describe('createSessionId', () => {
    test('should generate new session id', () => {
      jest.spyOn(Date, 'now').mockReturnValueOnce(1);
      const sessionId = Config.createSessionId();
      expect(sessionId).toBe(1);
    });
  });

  describe('createTransport', () => {
    test('should return http', () => {
      expect(createTransport()).toBeInstanceOf(core.Http);
    });
  });
});
