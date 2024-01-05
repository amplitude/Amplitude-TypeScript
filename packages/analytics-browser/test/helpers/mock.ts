import { Logger, MemoryStorage, UUID } from '@amplitude/analytics-core';
import { BrowserClient, BrowserConfig, LogLevel, UserSession } from '@amplitude/analytics-types';

export const createAmplitudeMock = (): jest.MockedObject<BrowserClient> => ({
  init: jest.fn(),
  add: jest.fn(),
  remove: jest.fn(),
  track: jest.fn(),
  logEvent: jest.fn(),
  identify: jest.fn(),
  groupIdentify: jest.fn(),
  setGroup: jest.fn(),
  revenue: jest.fn(),
  setOptOut: jest.fn(),
  flush: jest.fn(),
  getUserId: jest.fn(),
  setUserId: jest.fn(),
  getDeviceId: jest.fn(),
  setDeviceId: jest.fn(),
  getSessionId: jest.fn(),
  setSessionId: jest.fn(),
  extendSession: jest.fn(),
  reset: jest.fn(),
  setTransport: jest.fn(),
});

export const createConfigurationMock = (options?: Partial<BrowserConfig>) => {
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
    attribution: undefined,
    deviceId: undefined,
    cookieExpiration: 365,
    cookieSameSite: 'Lax',
    cookieSecure: false,
    cookieStorage: cookieStorage,
    cookieUpgrade: undefined,
    disableCookies: false,
    domain: '',
    lastEventTime: undefined,
    partnerId: undefined,
    sessionId: undefined,
    sessionManager: sessionStorage,
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
    trackingSessionEvents: false,
    userId: undefined,
    ...options,
  };
};
