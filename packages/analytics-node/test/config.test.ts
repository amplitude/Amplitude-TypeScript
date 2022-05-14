import * as Config from '../src/config';
import * as core from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-types';
import { Http } from '../src/transports/http';

describe('config', () => {
  const API_KEY = 'apiKey';

  describe('NodeConfig', () => {
    test('should create overwrite config', () => {
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
        transportProvider: new Http(),
        userId: undefined,
        useBatch: false,
      });
    });
  });

  describe('useNodeConfig', () => {
    test('should create default config', () => {
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = Config.useNodeConfig(API_KEY, undefined);
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
        transportProvider: new Http(),
        userId: undefined,
        useBatch: false,
      });
    });
  });
});
