/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import * as RemoteConfigFetch from '@amplitude/analytics-remote-config';
import { LogLevel, Logger, ServerZone } from '@amplitude/analytics-types';
import * as RRWeb from '@amplitude/rrweb';
import { SessionReplayLocalConfig } from '../src/config/local-config';

import * as Targeting from '@amplitude/targeting';
import { IDBFactory } from 'fake-indexeddb';
import { InteractionConfig, SessionReplayJoinedConfig, SessionReplayRemoteConfig } from '../src/config/types';
import { DEFAULT_SAMPLE_RATE } from '../src/constants';
import * as SessionReplayIDB from '../src/events/events-idb-store';
import * as Helpers from '../src/helpers';
import { SessionReplay } from '../src/session-replay';
import { SessionReplayOptions } from '../src/typings/session-replay';
import { flagConfig } from './flag-config-data';

jest.mock('@amplitude/targeting');
type MockedTargeting = jest.Mocked<typeof import('@amplitude/targeting')>;

jest.mock('@amplitude/rrweb');
type MockedRRWeb = jest.Mocked<typeof import('@amplitude/rrweb')>;

type MockedLogger = jest.Mocked<Logger>;

const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);

const samplingConfig = {
  sample_rate: 1,
  capture_enabled: true,
};

describe('SessionReplay', () => {
  const { evaluateTargeting } = Targeting as MockedTargeting;
  const { record } = RRWeb as MockedRRWeb;
  let originalFetch: typeof global.fetch;
  let globalSpy: jest.SpyInstance;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const addEventListenerMock = jest.fn() as jest.Mock<typeof window.addEventListener>;
  const removeEventListenerMock = jest.fn() as jest.Mock<typeof window.removeEventListener>;
  const mockGlobalScope = {
    addEventListener: addEventListenerMock,
    removeEventListener: removeEventListenerMock,
    document: {
      hasFocus: () => true,
    },
    location: {
      href: 'http://localhost',
    },
    indexedDB: new IDBFactory(),
    navigator: {
      storage: {
        estimate: () => {
          return {
            usage: 1000,
            quota: 100000,
            usageDetails: {
              indexedDB: 10,
            },
          };
        },
      },
    },
  } as unknown as typeof globalThis;
  const apiKey = 'static_key';
  const mockOptions: SessionReplayOptions = {
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    deviceId: '1a2b3c',
    optOut: false,
    sampleRate: 1,
    sessionId: 123,
    serverZone: ServerZone.EU,
    privacyConfig: {
      blockSelector: '.className',
      maskSelector: ['.className1', '.className2'],
    },
  };
  const mockEmptyOptions: SessionReplayOptions = {
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    deviceId: '1a2b3c',
    sessionId: 123,
  };
  let sessionReplay: SessionReplay;
  let getRemoteConfigMock: jest.Mock;
  let initialize: jest.SpyInstance;
  beforeEach(() => {
    getRemoteConfigMock = jest.fn().mockResolvedValue(samplingConfig);
    jest.spyOn(RemoteConfigFetch, 'createRemoteConfigFetch').mockResolvedValue({
      getRemoteConfig: getRemoteConfigMock,
      fetchTime: 0,
    });
    jest.spyOn(SessionReplayIDB, 'createEventsIDBStore');
    sessionReplay = new SessionReplay();
    initialize = jest.spyOn(sessionReplay, 'initialize');
    jest.useFakeTimers();
    originalFetch = global.fetch;
    (global.fetch as jest.Mock) = jest.fn(() => {
      return Promise.resolve({
        status: 200,
      });
    });
    globalSpy = jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(mockGlobalScope);
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global.Math, 'random').mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });
  describe('init', () => {
    test('should remove invalid selectors', async () => {
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        sampleRate: 0.5,
        privacyConfig: {
          blockSelector: ['AF<S>FA$!@$'],
          maskSelector: ['AF<S>FA$!@$!!'],
          unmaskSelector: ['AF<S>FA$!@$@@'],
        },
      }).promise;
      expect(sessionReplay.config?.privacyConfig?.blockSelector).toStrictEqual(undefined);
      expect(sessionReplay.config?.privacyConfig?.maskSelector).toStrictEqual(undefined);
      expect(sessionReplay.config?.privacyConfig?.unmaskSelector).toStrictEqual(undefined);
    });

    test('should setup sdk', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.5 }).promise;
      expect(sessionReplay.config?.transportProvider).toBeDefined();
      expect(sessionReplay.config?.flushMaxRetries).toBe(1);
      expect(sessionReplay.config?.optOut).toBe(false);
      expect(sessionReplay.config?.sampleRate).toBe(1); // Comes from remote config mock
      expect(sessionReplay.config?.captureEnabled).toBe(true); // Comes from remote config mock
      expect(sessionReplay.identifiers?.deviceId).toBe('1a2b3c');
      expect(sessionReplay.identifiers?.sessionId).toBe(123);
      expect(sessionReplay.config?.logLevel).toBe(0);
      expect(sessionReplay.loggerProvider).toBeDefined();
    });

    test('should invoke page leave listeners', async () => {
      const invokeEventMap = new Map<string, any>();
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        document: {
          hasFocus: () => false,
        },
        location: {
          href: 'http://localhost',
        },
        addEventListener: jest.fn((eventName, listenerFn): any => {
          invokeEventMap.set(eventName as string, listenerFn);
        }) as jest.Mock<typeof window.addEventListener<'blur' | 'focus' | 'pagehide' | 'beforeunload'>>,
        removeEventListener: removeEventListenerMock,
      } as unknown as typeof globalThis);
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.5 }).promise;
      const mockFn = jest.fn();
      sessionReplay.pageLeaveFns = [mockFn];
      invokeEventMap.get('beforeunload')({});
      expect(mockFn).toHaveBeenCalled();
    });

    test('should setup sdk with privacy config', async () => {
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        sampleRate: 0.5,
        privacyConfig: { blockSelector: ['.class', '#id'] },
      }).promise;
      expect(sessionReplay.config?.transportProvider).toBeDefined();
      expect(sessionReplay.config?.flushMaxRetries).toBe(1);
      expect(sessionReplay.config?.optOut).toBe(false);
      expect(sessionReplay.config?.sampleRate).toBe(1);
      expect(sessionReplay.identifiers?.deviceId).toBe('1a2b3c');
      expect(sessionReplay.identifiers?.sessionId).toBe(123);
      expect(sessionReplay.config?.logLevel).toBe(0);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.enable).toHaveBeenCalledWith(0);
      expect(sessionReplay.config?.privacyConfig?.blockSelector).toEqual(['.class', '#id']);
      expect(sessionReplay.loggerProvider).toBeDefined();
    });

    test.each([
      [
        {
          enabled: true,
          trackEveryNms: 500,
        },
        async (config: SessionReplayJoinedConfig) => {
          expect(config.interactionConfig?.enabled).toBe(true);
          expect(config.interactionConfig?.trackEveryNms).toBe(500);
        },
      ],
      [
        {
          enabled: true,
        },
        async (config: SessionReplayJoinedConfig) => {
          expect(config.interactionConfig?.enabled).toBe(true);
          expect(config.interactionConfig?.trackEveryNms).toBeUndefined();
        },
      ],
      [
        {
          enabled: false,
          trackEveryNms: 1_000,
        },
        async (config: SessionReplayJoinedConfig) => {
          expect(config.interactionConfig?.enabled).toBe(false);
          expect(config.interactionConfig?.trackEveryNms).toBe(1_000);
        },
      ],
      [
        undefined,
        async (config: SessionReplayJoinedConfig) => {
          expect(config.interactionConfig?.enabled).toBeUndefined();
          expect(config.interactionConfig?.trackEveryNms).toBeUndefined();
        },
      ],
    ])('should setup sdk with interaction config', async (interactionConfig, expectationFn) => {
      getRemoteConfigMock = jest.fn().mockImplementation((namespace: string, key: keyof SessionReplayRemoteConfig) => {
        if (namespace === 'sessionReplay' && key === 'sr_interaction_config') {
          return interactionConfig;
        }
        return;
      });
      jest.spyOn(RemoteConfigFetch, 'createRemoteConfigFetch').mockResolvedValue({
        getRemoteConfig: getRemoteConfigMock,
        fetchTime: 0,
      });
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        sampleRate: 0.5,
      }).promise;
      expect(sessionReplay.config?.transportProvider).toBeDefined();
      expect(sessionReplay.config?.flushMaxRetries).toBe(1);
      expect(sessionReplay.config?.optOut).toBe(false);
      expect(sessionReplay.identifiers?.deviceId).toBe('1a2b3c');
      expect(sessionReplay.identifiers?.sessionId).toBe(123);
      expect(sessionReplay.config?.logLevel).toBe(0);
      expect(sessionReplay.loggerProvider).toBeDefined();

      sessionReplay.config && expectationFn(sessionReplay.config);
    });

    test('should call initialize with shouldSendStoredEvents=true', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      expect(initialize).toHaveBeenCalledTimes(1);

      expect(initialize.mock.calls[0]).toEqual([true]);
    });
    test('should set up blur and focus event listeners', async () => {
      const initialize = jest.spyOn(sessionReplay, 'initialize');
      await sessionReplay.init(apiKey, mockOptions).promise;
      const recordMock = jest.fn();
      sessionReplay.recordEvents = recordMock;
      initialize.mockReset();
      expect(addEventListenerMock).toHaveBeenCalledTimes(3);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(addEventListenerMock.mock.calls[0][0]).toEqual('blur');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const blurCallback = addEventListenerMock.mock.calls[0][1];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      blurCallback();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(addEventListenerMock.mock.calls[1][0]).toEqual('focus');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const focusCallback = addEventListenerMock.mock.calls[1][1];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      focusCallback();
      expect(recordMock).toHaveBeenCalled();
    });
    test('it should not call initialize if the document does not have focus', () => {
      const initialize = jest.spyOn(sessionReplay, 'initialize');
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      expect(initialize).not.toHaveBeenCalled();
    });

    describe('flushMaxRetries config', () => {
      test('should use default config value if no max retries', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: undefined }).promise;

        expect(sessionReplay.config?.flushMaxRetries).toBe(2);
      });
      test('should cap max retries at default config value', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 10 }).promise;

        expect(sessionReplay.config?.flushMaxRetries).toBe(2);
      });
      test('should allow a lower value than default config value', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 0 }).promise;

        expect(sessionReplay.config?.flushMaxRetries).toBe(0);
      });
    });
  });

  describe('setSessionId', () => {
    test('should stop recording events for current session', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const stopRecordingMock = jest.fn();

      // Mock class as if it has already been recording events
      sessionReplay.sendEvents = stopRecordingMock;

      sessionReplay.setSessionId(456);
      expect(stopRecordingMock).toHaveBeenCalled();
    });

    test('should update the session id and start recording', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      record.mockReset();
      expect(sessionReplay.identifiers?.sessionId).toEqual(123);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('1a2b3c/123');
      if (!sessionReplay.eventsManager || !sessionReplay.joinedConfigGenerator || !sessionReplay.config) {
        throw new Error('Init not called');
      }
      const updatedConfig = { ...sessionReplay.config, sampleRate: 0.9 };
      const generateJoinedConfigPromise = Promise.resolve(updatedConfig);
      jest
        .spyOn(sessionReplay.joinedConfigGenerator, 'generateJoinedConfig')
        .mockReturnValue(generateJoinedConfigPromise);

      sessionReplay.setSessionId(456);
      expect(sessionReplay.identifiers?.sessionId).toEqual(456);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('1a2b3c/456');
      return generateJoinedConfigPromise.then(() => {
        expect(record).toHaveBeenCalledTimes(1);
        expect(sessionReplay.config).toEqual(updatedConfig);
      });
    });

    test('should regenerate config', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      if (!sessionReplay.joinedConfigGenerator || !sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const mockUpdatedConfig = new SessionReplayLocalConfig('static_key', { ...mockOptions, sampleRate: 0.6 });
      const generateJoinedConfig = jest
        .spyOn(sessionReplay.joinedConfigGenerator, 'generateJoinedConfig')
        .mockResolvedValue(mockUpdatedConfig);
      expect(sessionReplay.identifiers?.sessionId).toEqual(123);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('1a2b3c/123');

      await sessionReplay.setSessionId(456).promise;

      expect(generateJoinedConfig).toHaveBeenCalledTimes(1);
      expect(sessionReplay.config).toEqual(mockUpdatedConfig);
    });

    test('should not record if no config', async () => {
      await sessionReplay.setSessionId(456).promise;

      expect(record).not.toHaveBeenCalled();
    });

    test('should update the device id if passed', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.loggerProvider = mockLoggerProvider;

      sessionReplay.setSessionId(456, '9l8m7n');
      expect(sessionReplay.identifiers?.sessionId).toEqual(456);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('9l8m7n/456');
      expect(sessionReplay.identifiers?.deviceId).toEqual('9l8m7n');
      expect(sessionReplay.getDeviceId()).toEqual('9l8m7n');
    });
  });

  describe('getSessionId', () => {
    test('should update session id', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const stopRecordingMock = jest.fn();
      expect(sessionReplay.getSessionId()).toEqual(mockOptions.sessionId);

      // Mock class as if it has already been recording events
      sessionReplay.sendEvents = stopRecordingMock;

      sessionReplay.setSessionId(456);
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.getSessionId()).toEqual(456);
    });

    test('should return null if not initialized', () => {
      expect(sessionReplay.getSessionId()).toBeUndefined();
    });
  });

  describe('getSessionReplayProperties', () => {
    test('should return an empty object if config not set', () => {
      sessionReplay.loggerProvider = mockLoggerProvider;

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({});
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalled();
    });

    test('should return an empty object if shouldRecord is false', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.getShouldRecord = () => false;

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({});
    });

    test('should return the session recorded property if shouldRecord is true', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.getShouldRecord = () => true;

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({
        '[Amplitude] Session Replay ID': '1a2b3c/123',
      });
    });

    test('should ignore focus handler when debug mode is on.', async () => {
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        ...mockGlobalScope,
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      await sessionReplay.init(apiKey, { ...mockOptions, debugMode: true }).promise;
      const result = sessionReplay.getSessionReplayProperties();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(result).toEqual({
        '[Amplitude] Session Replay ID': '1a2b3c/123',
        '[Amplitude] Session Replay Debug': '{"appHash":"-109988594"}',
      });
    });

    test('should return session replay id property with null', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions }).promise;
      sessionReplay.getShouldRecord = () => true;
      if (sessionReplay.identifiers) {
        sessionReplay.identifiers.sessionReplayId = undefined;
      }

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({
        '[Amplitude] Session Replay ID': null,
      });
    });

    test('should return debug property', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, debugMode: true }).promise;
      sessionReplay.getShouldRecord = () => true;

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({
        '[Amplitude] Session Replay ID': '1a2b3c/123',
        '[Amplitude] Session Replay Debug': '{"appHash":"-109988594"}',
      });
    });
  });

  describe('initialize', () => {
    test('should return early if session id not set', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      if (!sessionReplay.eventsManager || !sessionReplay.identifiers) {
        throw new Error('Did not call init');
      }
      sessionReplay.identifiers.sessionId = undefined;
      const sendStoredEventsSpy = jest.spyOn(sessionReplay.eventsManager, 'sendStoredEvents');
      sessionReplay.initialize();
      expect(sendStoredEventsSpy).not.toHaveBeenCalled();
    });
    test('should return early if no identifiers', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.identifiers = undefined;
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const sendStoredEventsSpy = jest.spyOn(sessionReplay.eventsManager, 'sendStoredEvents');
      sessionReplay.initialize();
      expect(sendStoredEventsSpy).not.toHaveBeenCalled();
    });
    test('should return early if no device id', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.getDeviceId = jest.fn().mockReturnValue(undefined);
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const sendStoredEventsSpy = jest.spyOn(sessionReplay.eventsManager, 'sendStoredEvents');
      sessionReplay.initialize();
      expect(sendStoredEventsSpy).not.toHaveBeenCalled();
    });
    test('should send stored events and record events', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      record.mockReset();
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const eventsManagerInitSpy = jest.spyOn(sessionReplay.eventsManager, 'sendStoredEvents');

      sessionReplay.initialize(true);
      expect(eventsManagerInitSpy).toHaveBeenCalledWith({
        deviceId: mockOptions.deviceId,
      });
      expect(record).toHaveBeenCalledTimes(1);
    });
    test('should not send stored events if shouldSendStoredEvents is false', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      record.mockReset();
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const eventsManagerInitSpy = jest.spyOn(sessionReplay.eventsManager, 'sendStoredEvents');

      sessionReplay.initialize(false);
      expect(eventsManagerInitSpy).not.toHaveBeenCalled();
      expect(record).toHaveBeenCalledTimes(1);
    });

    test.each([
      { enabled: true, expectedLength: 1 },
      { enabled: false, expectedLength: 0 },
      { enabled: undefined, expectedLength: 0 },
    ])('should not register scroll if interaction config not enabled', async ({ enabled, expectedLength }) => {
      getRemoteConfigMock = jest.fn().mockImplementation((namespace: string, key: keyof SessionReplayRemoteConfig) => {
        if (namespace === 'sessionReplay' && key === 'sr_interaction_config') {
          return {
            enabled,
          } as InteractionConfig;
        }
        return;
      });
      jest.spyOn(RemoteConfigFetch, 'createRemoteConfigFetch').mockResolvedValue({
        getRemoteConfig: getRemoteConfigMock,
        fetchTime: 0,
      });
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        sampleRate: 0.5,
      }).promise;
      await sessionReplay.init(apiKey, { ...mockOptions }).promise;
      expect(sessionReplay.pageLeaveFns).toHaveLength(expectedLength);
    });

    test('should evaluate targeting based on existing user properties', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      const mockUserProperties = {
        country: 'US',
        city: 'San Francisco',
      };
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              userProperties: mockUserProperties,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      const evaluateTargetingSpy = jest.spyOn(sessionReplay, 'evaluateTargeting').mockResolvedValueOnce();

      sessionReplay.initialize(true);
      expect(evaluateTargetingSpy).toHaveBeenCalledWith({
        userProperties: mockUserProperties,
      });
    });
    test('should evaluate pass nothing to evaluate targeting if config not set', async () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.identifiers = {
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
        sessionReplayId: `${mockOptions.deviceId || 0}/${mockOptions.sessionId || 0}`,
      };
      sessionReplay.config = undefined;
      const evaluateTargetingSpy = jest.spyOn(sessionReplay, 'evaluateTargeting').mockResolvedValueOnce();

      sessionReplay.initialize(true);
      expect(evaluateTargetingSpy).toHaveBeenCalledWith({});
    });
  });

  describe('shouldOptOut', () => {
    test('should return undefined if no config set', () => {
      expect(sessionReplay.shouldOptOut()).toEqual(undefined);
    });
    test('should return opt out from identity store if set', async () => {
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              optOut: true,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      expect(sessionReplay.shouldOptOut()).toEqual(true);
    });
    test('should return opt out from identity store even if set to false', async () => {
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              optOut: false,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance', optOut: true }).promise;
      expect(sessionReplay.shouldOptOut()).toEqual(false);
    });
    test('should return config device id if set', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance', optOut: true }).promise;
      expect(sessionReplay.shouldOptOut()).toEqual(true);
    });
  });

  describe('getShouldRecord', () => {
    test('should return true if there are options', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(mockOptions.sampleRate);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(true);
    });
    test('should return false if no options', async () => {
      // Mock as if remote config call fails
      getRemoteConfigMock.mockImplementation(() => Promise.reject('error'));
      await sessionReplay.init(apiKey, mockEmptyOptions).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should return false if captureEnabled is false', async () => {
      getRemoteConfigMock.mockResolvedValue({
        sampleRate: 0.5,
        captureEnabled: false,
      });

      await sessionReplay.init(apiKey, { ...mockOptions }).promise;
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should return false if session not included in sample rate', async () => {
      // Mock as if remote config call fails
      getRemoteConfigMock.mockImplementation(() => Promise.reject('error'));
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementationOnce(() => false);

      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.2 }).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(0.2);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should set record as true if session is included in sample rate', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.2 }).promise;
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementationOnce(() => true);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(true);
    });
    test('should set record as false if opt out in config', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, optOut: true }).promise;
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should set record as false if no session id', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, sessionId: undefined }).promise;
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('opt out in config should override the sample rate', async () => {
      jest.spyOn(Math, 'random').mockImplementationOnce(() => 0.7);
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.8, optOut: true }).promise;
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should return false if  no config', async () => {
      const shouldRecord = sessionReplay.getShouldRecord();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).not.toHaveBeenCalled();
      expect(shouldRecord).toBe(false);
    });
  });

  describe('sendEvents', () => {
    test('it should send events for passed session', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const sendEventsMock = jest.fn();
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      sessionReplay.eventsManager.sendCurrentSequenceEvents = sendEventsMock;
      sessionReplay.sendEvents(123);
      expect(sendEventsMock).toHaveBeenCalledWith({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
    });
    test('it should send events for config session if none passed', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const sendEventsMock = jest.fn();
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      sessionReplay.eventsManager.sendCurrentSequenceEvents = sendEventsMock;
      sessionReplay.sendEvents();
      expect(sendEventsMock).toHaveBeenCalledWith({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
    });
    test('it should not send if no identifiers', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.identifiers = undefined;
      const sendEventsMock = jest.fn();
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      sessionReplay.eventsManager.sendCurrentSequenceEvents = sendEventsMock;
      sessionReplay.sendEvents();
      expect(sendEventsMock).not.toHaveBeenCalled();
    });
  });
  describe('stopRecordingEvents', () => {
    test('it should catch errors as warnings', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockStopRecordingEvents = jest.fn().mockImplementation(() => {
        throw new Error('test error');
      });
      sessionReplay.recordCancelCallback = mockStopRecordingEvents;
      sessionReplay.stopRecordingEvents();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });
    test('it should call recordCancelCallback and set it to null', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockStopRecordingEvents = jest.fn();
      sessionReplay.recordCancelCallback = mockStopRecordingEvents;
      sessionReplay.stopRecordingEvents();
      expect(mockStopRecordingEvents).toHaveBeenCalled();
      expect(sessionReplay.recordCancelCallback).toEqual(null);
    });
  });

  describe('recordEvents', () => {
    test('should return early if no config', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.createEventsIDBStore as jest.Mock).mock.results[0]
        .value;

      record.mockReset();
      sessionReplay.config = undefined;
      sessionReplay.recordEvents();
      expect(record).not.toHaveBeenCalled();
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const currentSequenceEvents = await createEventsIDBStoreInstance.db.get('sessionCurrentSequence', 123);
      expect(currentSequenceEvents).toEqual(undefined);
    });
    test('should return early if no identifiers', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      record.mockReset();
      sessionReplay.identifiers = undefined;
      sessionReplay.recordEvents();
      expect(record).not.toHaveBeenCalled();
    });

    test('should return early if user opts out', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, optOut: true, privacyConfig: { blockSelector: ['#class'] } })
        .promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.createEventsIDBStore as jest.Mock).mock.results[0]
        .value;
      sessionReplay.recordEvents();
      expect(record).not.toHaveBeenCalled();
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const currentSequenceEvents = await createEventsIDBStoreInstance.db.get('sessionCurrentSequence', 123);
      expect(currentSequenceEvents).toEqual(undefined);
    });

    test('should addEvent to eventManager', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.createEventsIDBStore as jest.Mock).mock.results[0]
        .value;
      sessionReplay.recordEvents();
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const addEventSpy = jest.spyOn(sessionReplay.eventsManager, 'addEvent');
      const currentSequenceEvents = await createEventsIDBStoreInstance.db.get('sessionCurrentSequence', 123);
      expect(currentSequenceEvents).toEqual(undefined);
      const recordArg = record.mock.calls[0][0];
      // Emit event, which is stored in class and IDB
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(addEventSpy).toHaveBeenCalledTimes(1);
      expect(addEventSpy).toHaveBeenCalledWith({
        event: { type: 'replay', data: mockEventString },
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
      });
    });

    test('should stop recording before starting anew', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      sessionReplay.recordEvents();
      expect(stopRecordingMock).toHaveBeenCalled();
    });

    test('should stop recording and send events if user opts out during recording', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.createEventsIDBStore as jest.Mock).mock.results[0]
        .value;
      sessionReplay.recordEvents();
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const currentSequenceEvents = await createEventsIDBStoreInstance.db.get('sessionCurrentSequence', 123);
      expect(currentSequenceEvents).toEqual(undefined);
      await createEventsIDBStoreInstance.addEventToCurrentSequence(123, mockEventString); // Add one event to list to trigger sending in sendEvents
      const sendEventsMock = jest.spyOn(sessionReplay.eventsManager, 'sendCurrentSequenceEvents');
      sessionReplay.shouldOptOut = () => true;
      const recordArg = record.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsMock).toHaveBeenCalledTimes(1);
      expect(sendEventsMock).toHaveBeenCalledWith({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.recordCancelCallback).toEqual(null);
      const updatedCurrentSequenceEvents = await createEventsIDBStoreInstance.db.get('sessionCurrentSequence', 123);
      expect(updatedCurrentSequenceEvents).toEqual({ events: [mockEventString], sessionId: 123 }); // events should not change, emmitted event should be ignored
    });

    test('should add an error handler', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      const recordArg = record.mock.calls[0][0];
      const errorHandlerReturn = recordArg?.errorHandler && recordArg?.errorHandler(new Error('test error'));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(errorHandlerReturn).toBe(true);
    });

    test('should rethrow CSSStylesheet errors', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      const recordArg = record.mock.calls[0][0];
      const stylesheetErrorMessage =
        "Failed to execute 'insertRule' on 'CSSStyleSheet': Failed to parse the rule 'body::-ms-expand{display: none}";
      expect(() => {
        recordArg?.errorHandler && recordArg?.errorHandler(new Error(stylesheetErrorMessage));
      }).toThrow(stylesheetErrorMessage);
    });

    test('should rethrow external errors', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      const recordArg = record.mock.calls[0][0];
      const error = new Error('test') as Error & { _external_?: boolean };
      error._external_ = true;
      expect(() => {
        recordArg?.errorHandler && recordArg?.errorHandler(error);
      }).toThrow(error);
    });
  });

  describe('evaluateTargeting', () => {
    let sessionReplay: SessionReplay;
    beforeEach(async () => {
      sessionReplay = new SessionReplay();
      sessionReplay.initialize = jest.fn(); // Mock out the initialize method as it calls evaluateTargeting, creates testing conflicts
      await sessionReplay.init(apiKey, { ...mockOptions }).promise;
    });
    test('should return undefined if no identifiers set', async () => {
      sessionReplay.identifiers = undefined;
      await sessionReplay.evaluateTargeting();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledWith(
        'Session replay init has not been called, cannot evaluate targeting.',
      );
    });

    test('should fetch remote config and use it to determine targeting match', async () => {
      expect(sessionReplay.sessionTargetingMatch).toBe(false);
      const getTargetingConfigMock = jest.fn().mockResolvedValue(flagConfig);
      if (!sessionReplay.remoteConfigFetch) {
        return;
      }
      evaluateTargeting.mockReturnValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      sessionReplay.remoteConfigFetch = { getTargetingConfig: getTargetingConfigMock, getRemoteConfig: jest.fn() };
      await sessionReplay.evaluateTargeting();
      expect(evaluateTargeting).toHaveBeenCalledWith({
        flag: flagConfig,
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
      });
      expect(sessionReplay.sessionTargetingMatch).toBe(true);
    });
    test('should pass user properties to evaluateTargeting', async () => {
      expect(sessionReplay.sessionTargetingMatch).toBe(false);
      const getTargetingConfigMock = jest.fn().mockResolvedValue(flagConfig);
      if (!sessionReplay.remoteConfigFetch) {
        return;
      }
      evaluateTargeting.mockReturnValueOnce({
        sr_targeting_config: {
          key: 'on',
        },
      });
      const mockUserProperties = {
        country: 'US',
        city: 'San Francisco',
      };
      sessionReplay.remoteConfigFetch = { getTargetingConfig: getTargetingConfigMock, getRemoteConfig: jest.fn() };
      await sessionReplay.evaluateTargeting({ userProperties: mockUserProperties });
      expect(evaluateTargeting).toHaveBeenCalled();
      expect(evaluateTargeting).toHaveBeenCalledWith({
        flag: flagConfig,
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
        userProperties: mockUserProperties,
      });
      expect(sessionReplay.sessionTargetingMatch).toBe(true);
    });
    test('should set sessionTargetingMatch to true if no targeting config returned', async () => {
      const getTargetingConfigMock = jest.fn().mockResolvedValue(undefined);
      if (!sessionReplay.remoteConfigFetch) {
        return;
      }
      sessionReplay.remoteConfigFetch = { getTargetingConfig: getTargetingConfigMock, getRemoteConfig: jest.fn() };
      await sessionReplay.evaluateTargeting();
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(sessionReplay.sessionTargetingMatch).toBe(true);
    });
    test('should set sessionTargetingMatch to true if targeting config returned as empty object', async () => {
      const getTargetingConfigMock = jest.fn().mockResolvedValue({});
      if (!sessionReplay.remoteConfigFetch) {
        return;
      }
      sessionReplay.remoteConfigFetch = { getTargetingConfig: getTargetingConfigMock, getRemoteConfig: jest.fn() };
      await sessionReplay.evaluateTargeting();
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(sessionReplay.sessionTargetingMatch).toBe(true);
    });
    test('should not update sessionTargetingMatch getTargetingConfig throws error', async () => {
      expect(sessionReplay.sessionTargetingMatch).toBe(false);
      const getTargetingConfigMock = jest.fn().mockImplementation(() => {
        throw new Error();
      });
      if (!sessionReplay.remoteConfigFetch) {
        return;
      }
      sessionReplay.remoteConfigFetch = { getTargetingConfig: getTargetingConfigMock, getRemoteConfig: jest.fn() };
      await sessionReplay.evaluateTargeting();
      expect(evaluateTargeting).not.toHaveBeenCalled();
      expect(sessionReplay.sessionTargetingMatch).toBe(false);
    });
  });

  describe('getDeviceId', () => {
    test('should return undefined if no config set', () => {
      expect(sessionReplay.getDeviceId()).toEqual(undefined);
    });
    test('should return device id from identity store if set', async () => {
      const storedDeviceId = '6t7y8u';
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              deviceId: storedDeviceId,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      expect(sessionReplay.getDeviceId()).toEqual(storedDeviceId);
    });
    test('should return config device id if set', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      expect(sessionReplay.getDeviceId()).toEqual(mockOptions.deviceId);
    });
  });

  describe('flush', () => {
    test('should do nothing on flush if init not called', async () => {
      await sessionReplay.flush(true);
      expect(sessionReplay.eventsManager).toBeUndefined();
    });
    test('should call track destination flush with useRetry as true', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const flushMock = jest.spyOn(sessionReplay.eventsManager, 'flush');

      await sessionReplay.flush(true);
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(true);
    });
    test('should call track destination flush without useRetry', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const flushMock = jest.spyOn(sessionReplay.eventsManager, 'flush');
      await sessionReplay.flush();
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(false);
    });
  });

  describe('shutdown', () => {
    test('should remove event listeners', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      removeEventListenerMock.mockReset();
      sessionReplay.shutdown();
      expect(removeEventListenerMock).toHaveBeenCalledTimes(3);
      expect(removeEventListenerMock.mock.calls[0][0]).toEqual('blur');
      expect(removeEventListenerMock.mock.calls[1][0]).toEqual('focus');
      expect(removeEventListenerMock.mock.calls[2][0]).toEqual('beforeunload');
    });

    test('should remove event listeners with pagehide', async () => {
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        ...mockGlobalScope,
        self: {
          onpagehide: (() => {
            /* do nothing */
          }) as any,
        },
      } as typeof globalThis);

      await sessionReplay.init(apiKey, mockOptions).promise;
      removeEventListenerMock.mockReset();
      sessionReplay.shutdown();
      expect(removeEventListenerMock).toHaveBeenCalledTimes(3);
      expect(removeEventListenerMock.mock.calls[0][0]).toEqual('blur');
      expect(removeEventListenerMock.mock.calls[1][0]).toEqual('focus');
      expect(removeEventListenerMock.mock.calls[2][0]).toEqual('pagehide');
    });

    test('should stop recording and send any events in queue', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const createEventsIDBStoreInstance = await (SessionReplayIDB.createEventsIDBStore as jest.Mock).mock.results[0]
        .value;
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      await createEventsIDBStoreInstance.addEventToCurrentSequence(123, mockEventString);
      const sendEventsMock = jest.spyOn(sessionReplay.eventsManager, 'sendCurrentSequenceEvents');
      sessionReplay.shutdown();
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.recordCancelCallback).toBe(null);
      expect(sendEventsMock).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(sendEventsMock.mock.calls[0][0]).toEqual({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
    });
  });

  describe('getCurrentUrl', () => {
    test('returns url if exists', () => {
      globalSpy.mockImplementation(() => ({
        location: {
          href: 'https://www.amplitude.com',
        },
      }));
      const url = Helpers.getCurrentUrl();
      expect(url).toEqual('https://www.amplitude.com');
    });

    test('returns empty string if url does not exist', () => {
      globalSpy.mockImplementation(() => undefined);
      const url = Helpers.getCurrentUrl();
      expect(url).toEqual('');
    });
  });

  describe('getMaskTextSelectors', () => {
    test('null config', () => {
      sessionReplay.config = undefined;
      expect(sessionReplay.getMaskTextSelectors()).not.toBeDefined();
    });
    test('null privacy config', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      if (sessionReplay.config) {
        sessionReplay.config.privacyConfig = undefined;
      }
      expect(sessionReplay.getMaskTextSelectors()).not.toBeDefined();
    });
    test('returns mask text selectors', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      expect(sessionReplay.getMaskTextSelectors()).toEqual(['.className1', '.className2']);
    });

    test('should track all text elements when level is conservative', async () => {
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        privacyConfig: {
          defaultMaskLevel: 'conservative',
        },
      }).promise;
      expect(sessionReplay.getMaskTextSelectors()).toEqual('*');
    });
  });

  describe('getBlockSelectors', () => {
    test('null config', () => {
      sessionReplay.config = undefined;
      expect(sessionReplay.getBlockSelectors()).not.toBeDefined();
    });
    test('null privacy config', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      if (sessionReplay.config) {
        sessionReplay.config.privacyConfig = undefined;
      }
      expect(sessionReplay.getBlockSelectors()).not.toBeDefined();
    });
    test('returns block selectors', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      expect(sessionReplay.getBlockSelectors()).toStrictEqual(['.className']);
    });
  });

  describe('getSessionReplayDebugPropertyValue', () => {
    test('null config', () => {
      sessionReplay.config = undefined;
      expect(sessionReplay.getSessionReplayDebugPropertyValue()).toBe('{"appHash":""}');
    });
  });

  describe('getDebugInfo', () => {
    test('null config', async () => {
      sessionReplay.config = undefined;
      expect(await sessionReplay.getDebugInfo()).toBeUndefined();
    });

    test('get config', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const debugInfo = await sessionReplay.getDebugInfo();
      expect(debugInfo).toBeDefined();
      expect(debugInfo?.config.apiKey).toStrictEqual('****_key');
      expect(debugInfo?.version).toMatch(/\d+.\d+.\d+/);
      expect(debugInfo?.percentOfQuota).toEqual(0.01);
      expect(debugInfo?.totalStorageSize).toEqual(1);
      expect(debugInfo?.usageDetails).toEqual(
        JSON.stringify({
          indexedDB: 10,
        }),
      );
    });
  });
});
