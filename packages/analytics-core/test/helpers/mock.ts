import { Logger } from '../../src/logger';
import { MemoryStorage } from '../../src/storage/memory';
import { UUID } from '../../src/utils/uuid';
import { LogLevel } from '../../src/types/loglevel';
import { UserSession } from '../../src/types/user-session';
import { BrowserConfig } from '../../src/types/config/browser-config';

export const createConfigurationMock = (options?: Partial<BrowserConfig>): BrowserConfig => {
  const apiKey = options?.apiKey ?? UUID();
  const cookieStorage = new MemoryStorage<UserSession>();

  return {
    // core config
    apiKey: apiKey,
    flushIntervalMillis: 1000,
    flushMaxRetries: 5,
    flushQueueSize: 10,
    logLevel: LogLevel.Warn,
    loggerProvider: new Logger(),
    minIdLength: undefined,
    offline: false,
    optOut: false,
    plan: undefined,
    ingestionMetadata: undefined,
    serverUrl: undefined,
    serverZone: undefined,
    storageProvider: {
      isEnabled: async () => true,
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      reset: jest.fn(),
      getRaw: jest.fn(),
    },
    transportProvider: {
      send: jest.fn(),
    },
    useBatch: false,

    // browser config
    appVersion: undefined,
    deviceId: undefined,
    cookieStorage: cookieStorage,
    lastEventTime: undefined,
    partnerId: undefined,
    sessionId: undefined,
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
    userId: undefined,
    ...options,
  };
};
