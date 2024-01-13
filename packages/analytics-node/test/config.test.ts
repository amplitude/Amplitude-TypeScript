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
        flushIntervalMillis: 10000,
        flushMaxRetries: 12,
        flushQueueSize: 200,
        instanceName: '$default_instance',
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        offline: false,
        _optOut: false,
        plan: undefined,
        ingestionMetadata: undefined,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        storageProvider: undefined,
        transportProvider: new Http(),
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
        flushIntervalMillis: 10000,
        flushMaxRetries: 12,
        flushQueueSize: 200,
        instanceName: '$default_instance',
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        offline: false,
        _optOut: false,
        partnerId: undefined,
        plan: undefined,
        ingestionMetadata: undefined,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        sessionId: undefined,
        storageProvider: undefined,
        transportProvider: new Http(),
        userId: undefined,
        useBatch: false,
      });
    });
  });
});
