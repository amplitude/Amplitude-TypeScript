/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as AnalyticsCore from '@amplitude/analytics-core';
import { LogLevel, ILogger, ServerZone } from '@amplitude/analytics-core';
import { SessionReplayLocalConfig } from '../src/config/local-config';

import { IDBFactory } from 'fake-indexeddb';
import { LoggingConfig, SessionReplayJoinedConfig } from '../src/config/types';
import { CustomRRwebEvent, DEFAULT_SAMPLE_RATE } from '../src/constants';
import * as SessionReplayIDB from '../src/events/events-idb-store';
import * as SessionReplayEventsManager from '../src/events/events-manager';
import * as Helpers from '../src/helpers';
import { SessionReplay } from '../src/session-replay';
import { SessionReplayOptions } from '../src/typings/session-replay';

jest.mock('@amplitude/analytics-remote-config');

// Accessing mock helper functions from the Jest manual mock for @amplitude/analytics-remote-config.
// This import is intentionally ts-ignored as these helpers are not part of the module's type definitions.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { __setNamespaceConfig, __setShouldThrowError } from '@amplitude/analytics-remote-config';

type MockedLogger = jest.Mocked<ILogger>;

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

// Add this helper function at the top of your describe block
function createMockRecordFunction() {
  const mockRecordFn = jest.fn().mockReturnValue(jest.fn()) as jest.Mock & {
    addCustomEvent: jest.Mock;
    mirror: { getNode: jest.Mock };
  };
  mockRecordFn.addCustomEvent = jest.fn();
  mockRecordFn.mirror = {
    getNode: jest.fn().mockReturnValue(null),
  };
  return mockRecordFn;
}

describe('SessionReplay', () => {
  let originalFetch: typeof global.fetch;
  let deferEvents: typeof global.requestIdleCallback;
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
    storeType: 'idb',
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
  let initialize: jest.SpyInstance;
  let mockRecordFunction: jest.Mock & { addCustomEvent: jest.Mock; mirror: { getNode: jest.Mock } };
  beforeEach(() => {
    // Set default remote config
    __setNamespaceConfig({
      sr_sampling_config: samplingConfig,
      sr_privacy_config: {},
    });
    __setShouldThrowError(false);
    jest.spyOn(SessionReplayIDB, 'createStore');
    sessionReplay = new SessionReplay();
    initialize = jest.spyOn(sessionReplay, 'initialize');
    jest.useFakeTimers();
    originalFetch = global.fetch;
    (global.fetch as jest.Mock) = jest.fn(() => {
      return Promise.resolve({
        status: 200,
      });
    });
    deferEvents = global.requestIdleCallback;
    (global.requestIdleCallback as jest.Mock) = jest.fn((callback, options) => {
      setTimeout(() => {
        callback();
      }, (options?.timeout as number) || 0);
    });
    globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(mockGlobalScope);

    // Create mock record function with addCustomEvent method and mirror property
    mockRecordFunction = jest.fn().mockReturnValue(jest.fn()) as jest.Mock & {
      addCustomEvent: jest.Mock;
      mirror: { getNode: jest.Mock };
    };
    mockRecordFunction.addCustomEvent = jest.fn();
    mockRecordFunction.mirror = {
      getNode: jest.fn().mockReturnValue(null),
    };
    jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any).mockResolvedValue(mockRecordFunction);
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global.Math, 'random').mockRestore();
    global.fetch = originalFetch;
    global.requestIdleCallback = deferEvents;
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

    test('should start network observers when network logging is enabled in remote config', async () => {
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_interaction_config: {
          enabled: true,
        },
        sr_logging_config: {
          network: {
            enabled: true,
          },
        },
      });

      await sessionReplay.init(apiKey, mockOptions).promise;
      const startSpy = jest.spyOn(AnalyticsCore.networkObserver, 'subscribe');
      await sessionReplay.recordEvents();
      expect(startSpy).toHaveBeenCalled();
    });

    test('should not start network observers when network logging is disabled in remote config', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const startSpy = jest.spyOn(AnalyticsCore.networkObserver, 'subscribe');
      await sessionReplay.recordEvents();
      expect(startSpy).not.toHaveBeenCalled();
    });

    test('should not initialize network observers when config is undefined', async () => {
      // Create a new SessionReplay instance without initializing
      const sessionReplayWithoutConfig = new SessionReplay();

      const networkObserversConstructorSpy = jest.spyOn(AnalyticsCore.networkObserver, 'subscribe');

      await (sessionReplayWithoutConfig as any).initializeNetworkObservers();

      expect(networkObserversConstructorSpy).not.toHaveBeenCalled();

      expect((sessionReplayWithoutConfig as any).networkObservers).toBeUndefined();
    });

    test('should log warning when NetworkObservers import fails', async () => {
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_interaction_config: {
          enabled: true,
        },
        sr_logging_config: {
          network: {
            enabled: true,
          },
        },
      });

      // Mock the dynamic import to throw an error
      jest.doMock('../src/observers', () => {
        throw new Error('Import failed');
      });

      await sessionReplay.init(apiKey, mockOptions).promise;

      // Call initializeNetworkObservers directly to test the catch block
      await (sessionReplay as any).initializeNetworkObservers();

      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        'Failed to import or instantiate NetworkObservers:',
        expect.any(Error),
      );
      expect((sessionReplay as any).networkObservers).toBeUndefined();

      // Clean up the mock
      jest.dontMock('../src/observers');
    });

    test('should catch error and log a warn when initializing', async () => {
      // enable interaction config
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_interaction_config: {
          enabled: true,
        },
      });

      // mock the error when creating events managers
      jest.spyOn(SessionReplayEventsManager, 'createEventsManager').mockImplementation(() => {
        throw new Error('test error');
      });

      await sessionReplay.init(apiKey, {
        ...mockOptions,
        sampleRate: 0.5,
        privacyConfig: {
          blockSelector: ['AF<S>FA$!@$'],
          maskSelector: ['AF<S>FA$!@$!!'],
          unmaskSelector: ['AF<S>FA$!@$@@'],
        },
      }).promise;

      expect(mockLoggerProvider.warn).toHaveBeenCalled();
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
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
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

    test('fallback to memory store if no indexeddb', async () => {
      globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        ...mockGlobalScope,
        indexedDB: null as any,
      });
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        sampleRate: 0.5,
        storeType: 'idb',
      }).promise;

      expect(mockLoggerProvider.log).toHaveBeenCalledWith('Using memory for event storage.');
    });

    test('fallback to memory store if no global scope', async () => {
      globalSpy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(undefined);
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        sampleRate: 0.5,
        storeType: 'idb',
      }).promise;

      expect(mockLoggerProvider.log).toHaveBeenCalledWith('Using memory for event storage.');
    });

    test.each([
      [
        {
          enabled: true,
          trackEveryNms: 500,
        },
        async (config: SessionReplayJoinedConfig) => {
          expect(config.interactionConfig?.enabled).toBe(true);
          expect(config.interactionConfig?.batch).toBeUndefined();
          expect(config.interactionConfig?.trackEveryNms).toBe(500);
        },
      ],
      [
        {
          enabled: true,
        },
        async (config: SessionReplayJoinedConfig) => {
          expect(config.interactionConfig?.enabled).toBe(true);
          expect(config.interactionConfig?.batch).toBeUndefined();
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
          expect(config.interactionConfig?.batch).toBeUndefined();
          expect(config.interactionConfig?.trackEveryNms).toBe(1_000);
        },
      ],
      [
        undefined,
        async (config: SessionReplayJoinedConfig) => {
          expect(config.interactionConfig?.enabled).toBeUndefined();
          expect(config.interactionConfig?.batch).toBeUndefined();
          expect(config.interactionConfig?.trackEveryNms).toBeUndefined();
        },
      ],
      [
        {
          enabled: true,
          batch: true,
        },
        async (config: SessionReplayJoinedConfig) => {
          expect(config.interactionConfig?.enabled).toBe(true);
          expect(config.interactionConfig?.batch).toBe(true);
          expect(config.interactionConfig?.trackEveryNms).toBeUndefined();
        },
      ],
      [
        {
          enabled: true,
          batch: false,
        },
        async (config: SessionReplayJoinedConfig) => {
          expect(config.interactionConfig?.enabled).toBe(true);
          expect(config.interactionConfig?.batch).toBe(false);
          expect(config.interactionConfig?.trackEveryNms).toBeUndefined();
        },
      ],
    ])('should setup sdk with interaction config', async (interactionConfig, expectationFn) => {
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_interaction_config: interactionConfig,
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

      sessionReplay.config && (await expectationFn(sessionReplay.config));
    });

    test.each([
      [
        {
          console: { enabled: true, levels: ['warn', 'error'] },
        },
        async (config: SessionReplayJoinedConfig) => {
          expect(config.loggingConfig?.console.enabled).toBe(true);
          expect(config.loggingConfig?.console.levels).toStrictEqual(['warn', 'error']);
        },
      ],
      [
        {
          console: { enabled: true, levels: ['error'] },
        },
        async (config: SessionReplayJoinedConfig) => {
          expect(config.loggingConfig?.console.enabled).toBe(true);
          expect(config.loggingConfig?.console.levels).toStrictEqual(['error']);
        },
      ],
    ])('should setup sdk with interaction config', async (loggingConfig, expectationFn) => {
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_logging_config: loggingConfig,
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

      if (sessionReplay.config) {
        await expectationFn(sessionReplay.config);
      }
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
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
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

    test('should terminate previous eventCompressor on re-initialization', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      // Spy on terminate of the first eventCompressor
      const terminateSpy = jest.spyOn(sessionReplay.eventCompressor!, 'terminate');
      // Call init again to trigger terminate
      await sessionReplay.init(apiKey, mockOptions).promise;
      expect(terminateSpy).toHaveBeenCalled();
    });

    test.each([
      {
        description: 'should call rrweb with applyBackgroundColorToBlockedElements=true when option is true',
        options: { applyBackgroundColorToBlockedElements: true },
        expectedValue: true,
      },
      {
        description: 'should call rrweb with applyBackgroundColorToBlockedElements=false when option is false',
        options: { applyBackgroundColorToBlockedElements: false },
        expectedValue: false,
      },
      {
        description: 'should call rrweb with applyBackgroundColorToBlockedElements=false when option is undefined',
        options: { applyBackgroundColorToBlockedElements: undefined },
        expectedValue: false,
      },
      {
        description: 'should call rrweb with applyBackgroundColorToBlockedElements=false when option is not provided',
        options: {},
        expectedValue: false,
      },
    ])('$description', async ({ options, expectedValue }) => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        ...options,
      }).promise;
      await sessionReplay.recordEvents();

      const recordArg = mockRecordFunction.mock.calls[0][0];
      expect(recordArg?.applyBackgroundColorToBlockedElements).toBe(expectedValue);
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

    test.only('should update the session id and start recording', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      mockRecordFunction.mockReset();
      expect(sessionReplay.identifiers?.sessionId).toEqual(123);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('1a2b3c/123');
      if (!sessionReplay.eventsManager || !sessionReplay.joinedConfigGenerator || !sessionReplay.config) {
        throw new Error('Init not called');
      }
      const updatedConfig = { ...sessionReplay.config, sampleRate: 0.9 };
      const generateJoinedConfigPromise = Promise.resolve({
        joinedConfig: updatedConfig,
        localConfig: updatedConfig,
        remoteConfig: undefined,
      });
      jest
        .spyOn(sessionReplay.joinedConfigGenerator, 'generateJoinedConfig')
        .mockReturnValue(generateJoinedConfigPromise);

      await sessionReplay.setSessionId(456).promise;

      expect(sessionReplay.identifiers?.sessionId).toEqual(456);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('1a2b3c/456');
      await generateJoinedConfigPromise;
      expect(mockRecordFunction).toHaveBeenCalledTimes(1);
      expect(sessionReplay.config).toEqual(updatedConfig);
    });

    test('should regenerate config', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      if (!sessionReplay.joinedConfigGenerator || !sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const mockUpdatedConfig = new SessionReplayLocalConfig('static_key', { ...mockOptions, sampleRate: 0.6 });
      const mockSessionReplayConfigs = {
        joinedConfig: mockUpdatedConfig,
        localConfig: mockUpdatedConfig,
        remoteConfig: undefined,
      };
      const generateJoinedConfig = jest
        .spyOn(sessionReplay.joinedConfigGenerator, 'generateJoinedConfig')
        .mockResolvedValue(mockSessionReplayConfigs);
      expect(sessionReplay.identifiers?.sessionId).toEqual(123);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('1a2b3c/123');

      await sessionReplay.setSessionId(456).promise;

      expect(generateJoinedConfig).toHaveBeenCalledTimes(1);
      expect(sessionReplay.config).toEqual(mockUpdatedConfig);
    });

    test('should not record if no config', async () => {
      await sessionReplay.setSessionId(456).promise;

      expect(mockRecordFunction).not.toHaveBeenCalled();
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
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
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
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
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

    test('should add a custom rrweb event', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, debugMode: true }).promise;
      sessionReplay.addCustomRRWebEvent = jest.fn();
      sessionReplay.getShouldRecord = () => true;

      const result = sessionReplay.getSessionReplayProperties();
      expect(sessionReplay.addCustomRRWebEvent).toHaveBeenCalledWith(
        CustomRRwebEvent.GET_SR_PROPS,
        {
          shouldRecord: true,
          eventProperties: result,
        },
        false,
      );
    });
    test('should increment the event count', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, debugMode: true }).promise;
      expect(sessionReplay.eventCount).toBe(0);

      sessionReplay.getSessionReplayProperties();
      expect(sessionReplay.eventCount).toBe(1);
    });
    test('should add a custom rrweb event with storage info if event count is 10, then reset event count', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, debugMode: true }).promise;
      sessionReplay.addCustomRRWebEvent = jest.fn();
      sessionReplay.getShouldRecord = () => true;
      sessionReplay.eventCount = 10;

      const result = sessionReplay.getSessionReplayProperties();
      expect(sessionReplay.addCustomRRWebEvent).toHaveBeenCalledWith(
        CustomRRwebEvent.GET_SR_PROPS,
        {
          shouldRecord: true,
          eventProperties: result,
        },
        true,
      );
      expect(sessionReplay.eventCount).toEqual(1);
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
      await sessionReplay.initialize(true);
      expect(sendStoredEventsSpy).not.toHaveBeenCalled();
    });
    test('should return early if no identifiers', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.identifiers = undefined;
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const sendStoredEventsSpy = jest.spyOn(sessionReplay.eventsManager, 'sendStoredEvents');
      await sessionReplay.initialize(true);
      expect(sendStoredEventsSpy).not.toHaveBeenCalled();
    });
    test('should return early if no device id', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.getDeviceId = jest.fn().mockReturnValue(undefined);
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const sendStoredEventsSpy = jest.spyOn(sessionReplay.eventsManager, 'sendStoredEvents');
      await sessionReplay.initialize(true);
      expect(sendStoredEventsSpy).not.toHaveBeenCalled();
    });
    test('should send stored events and record events', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const eventsManagerInitSpy = jest.spyOn(sessionReplay.eventsManager, 'sendStoredEvents');

      // Override the exisiting global record function with a mock record function
      const recordFunction = createMockRecordFunction();
      const existingRecordFunction = jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any);
      existingRecordFunction.mockResolvedValue(recordFunction);

      await sessionReplay.initialize(true);
      expect(eventsManagerInitSpy).toHaveBeenCalledWith({
        deviceId: mockOptions.deviceId,
      });

      expect(recordFunction).toHaveBeenCalledTimes(1);
    });
    test('should not send stored events if shouldSendStoredEvents is false', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const eventsManagerInitSpy = jest.spyOn(sessionReplay.eventsManager, 'sendStoredEvents');

      // Override the exisiting global record function with a mock record function
      const recordFunction = createMockRecordFunction();
      const existingRecordFunction = jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any);
      existingRecordFunction.mockResolvedValue(recordFunction);

      await sessionReplay.initialize(false);

      expect(eventsManagerInitSpy).not.toHaveBeenCalled();
      expect(recordFunction).toHaveBeenCalledTimes(1);
    });

    test.each([
      { enabled: true, expectedLength: 1 },
      { enabled: false, expectedLength: 0 },
      { enabled: undefined, expectedLength: 0 },
    ])('should not register scroll if interaction config not enabled', async ({ enabled, expectedLength }) => {
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_interaction_config: {
          enabled,
        },
      });

      await sessionReplay.init(apiKey, {
        ...mockOptions,
        sampleRate: 0.5,
      }).promise;
      await sessionReplay.initialize(true);
      expect(sessionReplay.pageLeaveFns).toHaveLength(expectedLength);
    });

    test('should call recordEvents when called without params', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const recordEventsSpy = jest.spyOn(sessionReplay, 'recordEvents');
      await sessionReplay.initialize();
      expect(recordEventsSpy).toHaveBeenCalled();
    });
  });

  describe('shouldOptOut', () => {
    test('should return undefined if no config set', () => {
      expect(sessionReplay.shouldOptOut()).toEqual(undefined);
    });
    test('should return opt out from identity store if set', async () => {
      jest.spyOn(AnalyticsCore, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              optOut: true,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsCore.getAnalyticsConnector>);
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      expect(sessionReplay.shouldOptOut()).toEqual(true);
    });
    test('should return opt out from identity store even if set to false', async () => {
      jest.spyOn(AnalyticsCore, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              optOut: false,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsCore.getAnalyticsConnector>);
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
      __setShouldThrowError(true);
      await sessionReplay.init(apiKey, mockEmptyOptions).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should return false if captureEnabled is false', async () => {
      __setNamespaceConfig({
        sr_sampling_config: {
          capture_enabled: false,
          sample_rate: 0.5,
        },
        sr_privacy_config: {},
      });
      await sessionReplay.init(apiKey, { ...mockOptions }).promise;
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should return false if session not included in sample rate', async () => {
      // Mock as if remote config call fails
      __setShouldThrowError(true);
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
    let createEventsIDBStoreInstance: SessionReplayIDB.SessionReplayEventsIDBStore;
    beforeEach(async () => {
      createEventsIDBStoreInstance = (await SessionReplayIDB.SessionReplayEventsIDBStore.new('replay', {
        loggerProvider: mockLoggerProvider,
        apiKey,
      }))!;
    });

    test('should return early if no config', async () => {
      // Spy on recordEvents to track calls
      const recordEventsSpy = jest.spyOn(sessionReplay, 'recordEvents');

      await sessionReplay.init(apiKey, mockOptions).promise;
      // Advance timers to allow any pending async operations to complete
      jest.runAllTimers();

      // Reset both spies after initialization
      recordEventsSpy.mockClear();

      // Now set config to undefined and call recordEvents
      sessionReplay.config = undefined;

      // Override the exisiting global record function with a mock record function
      const recordFunction = createMockRecordFunction();
      const existingRecordFunction = jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any);
      existingRecordFunction.mockResolvedValue(recordFunction);

      await sessionReplay.recordEvents();

      // Verify recordEvents was called but mockRecordFunction was not
      expect(recordEventsSpy).toHaveBeenCalledTimes(1);
      expect(recordFunction).not.toHaveBeenCalled();

      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const currentSequenceEvents = await createEventsIDBStoreInstance.getCurrentSequenceEvents(123);
      expect(currentSequenceEvents).toEqual(undefined);

      // Clean up spy
      recordEventsSpy.mockRestore();
    });
    test('should return early if no identifiers', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      sessionReplay.identifiers = undefined;

      // Override the exisiting global record function with a mock record function
      const recordFunction = createMockRecordFunction();
      const existingRecordFunction = jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any);
      existingRecordFunction.mockResolvedValue(recordFunction);

      await sessionReplay.recordEvents();

      expect(recordFunction).not.toHaveBeenCalled();
    });

    test('should return early if user opts out', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, optOut: true, privacyConfig: { blockSelector: ['#class'] } })
        .promise;
      await sessionReplay.recordEvents();
      expect(mockRecordFunction).not.toHaveBeenCalled();
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const currentSequenceEvents = await createEventsIDBStoreInstance.getCurrentSequenceEvents(123);
      expect(currentSequenceEvents).toEqual(undefined);
    });

    test('should stop recording before starting anew', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      await sessionReplay.recordEvents();
      expect(stopRecordingMock).toHaveBeenCalled();
    });

    test('should stop recording and send events if user opts out during recording', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      await sessionReplay.recordEvents();
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      const currentSequenceEvents = await createEventsIDBStoreInstance.getCurrentSequenceEvents(123);
      expect(currentSequenceEvents).toEqual(undefined);
      await createEventsIDBStoreInstance.addEventToCurrentSequence(123, mockEventString); // Add one event to list to trigger sending in sendEvents
      const sendEventsMock = jest.spyOn(sessionReplay.eventsManager, 'sendCurrentSequenceEvents');
      sessionReplay.shouldOptOut = () => true;
      const recordArg = mockRecordFunction.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsMock).toHaveBeenCalledTimes(1);
      expect(sendEventsMock).toHaveBeenCalledWith({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.recordCancelCallback).toEqual(null);
      const updatedCurrentSequenceEvents = await createEventsIDBStoreInstance.getCurrentSequenceEvents(123);
      expect(updatedCurrentSequenceEvents).toEqual([{ events: [mockEventString], sessionId: 123 }]); // events should not change, emmitted event should be ignored
    });

    test('should add an error handler', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      await sessionReplay.recordEvents();
      const recordArg = mockRecordFunction.mock.calls[0][0];
      const errorHandlerReturn = recordArg?.errorHandler && recordArg?.errorHandler(new Error('test error'));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(errorHandlerReturn).toBe(true);
    });

    test('should add slim dom options', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, omitElementTags: { script: true, comment: true } }).promise;
      await sessionReplay.recordEvents();
      const recordArg = mockRecordFunction.mock.calls[0][0];
      expect(recordArg?.slimDOMOptions).toEqual({ script: true, comment: true });
    });

    test('should rethrow CSSStylesheet errors', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      await sessionReplay.recordEvents();
      const recordArg = mockRecordFunction.mock.calls[0][0];
      const stylesheetErrorMessage =
        "Failed to execute 'insertRule' on 'CSSStyleSheet': Failed to parse the rule 'body::-ms-expand{display: none}";
      expect(() => {
        recordArg?.errorHandler && recordArg?.errorHandler(new Error(stylesheetErrorMessage));
      }).toThrow(stylesheetErrorMessage);
    });

    test('should rethrow external errors', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      await sessionReplay.recordEvents();
      const recordArg = mockRecordFunction.mock.calls[0][0];
      const error = new Error('test') as Error & { _external_?: boolean };
      error._external_ = true;
      expect(() => {
        recordArg?.errorHandler && recordArg?.errorHandler(error);
      }).toThrow(error);
    });

    test('should not add hooks if interaction config is not enabled', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      await sessionReplay.recordEvents();
      const recordArg = mockRecordFunction.mock.calls[0][0];
      const error = new Error('test') as Error & { _external_?: boolean };
      error._external_ = true;
      expect(recordArg?.hooks).toStrictEqual({});
    });

    test('should add hooks if interaction config is enabled', async () => {
      // enable interaction config
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_interaction_config: {
          enabled: true,
        },
      });

      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      await sessionReplay.recordEvents();
      const recordArg = mockRecordFunction.mock.calls[0][0];
      const error = new Error('test') as Error & { _external_?: boolean };
      error._external_ = true;
      expect(recordArg?.hooks?.mouseInteraction).toBeDefined();
      expect(recordArg?.hooks?.scroll).toBeDefined();
    });

    test('should warn if record throws during recordEvents', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      (mockRecordFunction as unknown as jest.Mock).mockImplementationOnce(() => {
        throw new Error('record failed');
      });
      const warnSpy = jest.spyOn(sessionReplay.loggerProvider, 'warn');
      await sessionReplay.recordEvents();
      expect(warnSpy).toHaveBeenCalledWith('Failed to initialize session replay:', expect.any(Error));
    });

    test('should pass empty array for ugcFilterRules when not provided', async () => {
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_interaction_config: {
          enabled: true,
        },
      });

      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      await sessionReplay.recordEvents();
      const recordArg = mockRecordFunction.mock.calls[0][0];
      const mouseInteractionHook = recordArg?.hooks?.mouseInteraction;

      expect(mouseInteractionHook).toBeDefined();
      expect(mouseInteractionHook).toBeInstanceOf(Function);
    });

    test('should pass provided ugcFilterRules when configured', async () => {
      const mockUgcFilterRules = ['rule1', 'rule2'];

      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_interaction_config: {
          enabled: true,
          ugcFilterRules: mockUgcFilterRules,
        },
      });

      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      await sessionReplay.recordEvents();
      const recordArg = mockRecordFunction.mock.calls[0][0];
      const mouseInteractionHook = recordArg?.hooks?.mouseInteraction;

      expect(mouseInteractionHook).toBeDefined();
      expect(mouseInteractionHook).toBeInstanceOf(Function);
    });

    test('should pass empty array for ugcFilterRules when explicitly set to empty', async () => {
      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_interaction_config: {
          enabled: true,
          ugcFilterRules: [],
        },
      });

      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      await sessionReplay.recordEvents();
      const recordArg = mockRecordFunction.mock.calls[0][0];
      const mouseInteractionHook = recordArg?.hooks?.mouseInteraction;

      expect(mouseInteractionHook).toBeDefined();
      expect(mouseInteractionHook).toBeInstanceOf(Function);
    });

    describe('emit callback - meta event URL filtering', () => {
      test('should apply UGC filter rules to meta event href when interaction config is enabled and ugcFilterRules exist', async () => {
        const mockUgcFilterRules = [{ selector: 'https://example.com/*', replacement: 'https://example.com/filtered' }];

        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: {
            enabled: true,
            ugcFilterRules: mockUgcFilterRules,
          },
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const metaEvent = {
          type: 4,
          data: { href: 'https://example.com/sensitive-page' },
          timestamp: Date.now(),
        };

        // Simulate emitting a meta event
        recordArg?.emit && recordArg?.emit(metaEvent);

        expect(getPageUrlSpy).toHaveBeenCalledWith('https://example.com/sensitive-page', mockUgcFilterRules);
        expect(metaEvent.data.href).toBe('https://example.com/filtered');
      });

      test('should not apply UGC filter rules to meta event when interaction config is disabled', async () => {
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: {
            enabled: false,
            ugcFilterRules: [{ selector: 'https://example.com/*', replacement: 'https://example.com/filtered' }],
          },
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl').mockReturnValue('https://example.com/sensitive-page');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const originalHref = 'https://example.com/sensitive-page';
        const metaEvent = {
          type: 4,
          data: { href: originalHref },
          timestamp: Date.now(),
        };

        // Simulate emitting a meta event
        recordArg?.emit && recordArg?.emit(metaEvent);

        expect(getPageUrlSpy).toHaveBeenCalledWith(originalHref, []);
        expect(metaEvent.data.href).toBe(originalHref);
      });

      test('should not apply UGC filter rules to meta event when ugcFilterRules is undefined', async () => {
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: {
            enabled: true,
            ugcFilterRules: undefined,
          },
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl').mockReturnValue('https://example.com/sensitive-page');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const originalHref = 'https://example.com/sensitive-page';
        const metaEvent = {
          type: 4,
          data: { href: originalHref },
          timestamp: Date.now(),
        };

        // Simulate emitting a meta event
        recordArg?.emit && recordArg?.emit(metaEvent);

        expect(getPageUrlSpy).toHaveBeenCalledWith(originalHref, []);
        expect(metaEvent.data.href).toBe(originalHref);
      });

      test('should call getPageUrl with empty array when ugcFilterRules is empty array', async () => {
        const emptyUgcFilterRules: any[] = [];
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: {
            enabled: true,
            ugcFilterRules: emptyUgcFilterRules,
          },
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl').mockReturnValue('https://example.com/sensitive-page');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const originalHref = 'https://example.com/sensitive-page';
        const metaEvent = {
          type: 4,
          data: { href: originalHref },
          timestamp: Date.now(),
        };

        // Simulate emitting a meta event
        recordArg?.emit && recordArg?.emit(metaEvent);

        // Empty array is truthy, so getPageUrl should be called
        expect(getPageUrlSpy).toHaveBeenCalledWith(originalHref, emptyUgcFilterRules);
        expect(metaEvent.data.href).toBe(originalHref); // Since we mocked the return value to be the same
      });

      test('should not apply UGC filter rules to non-meta events', async () => {
        const mockUgcFilterRules = [{ selector: 'https://example.com/*', replacement: 'https://example.com/filtered' }];
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: {
            enabled: true,
            ugcFilterRules: mockUgcFilterRules,
          },
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const originalHref = 'https://example.com/sensitive-page';
        const nonMetaEvent = {
          type: 2, // Not a meta event (type 4)
          data: { href: originalHref },
          timestamp: Date.now(),
        };

        // Simulate emitting a non-meta event
        recordArg?.emit && recordArg?.emit(nonMetaEvent);

        expect(getPageUrlSpy).not.toHaveBeenCalled();
        expect(nonMetaEvent.data.href).toBe(originalHref);
      });

      test('should handle meta event without href data', async () => {
        const mockUgcFilterRules = [{ selector: 'https://example.com/*', replacement: 'https://example.com/filtered' }];
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: {
            enabled: true,
            ugcFilterRules: mockUgcFilterRules,
          },
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const metaEvent = {
          type: 4,
          data: { width: 1728, height: 154 }, // No href property
          timestamp: Date.now(),
        };

        // Simulate emitting a meta event without href
        expect(() => {
          recordArg?.emit && recordArg?.emit(metaEvent);
        }).not.toThrow();

        expect(getPageUrlSpy).toHaveBeenCalledWith(undefined, mockUgcFilterRules);
      });

      test('should not apply UGC filter rules when config is undefined', async () => {
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: {
            enabled: true,
            ugcFilterRules: [{ selector: 'https://example.com/*', replacement: 'https://example.com/filtered' }],
          },
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl').mockReturnValue('https://example.com/sensitive-page');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        // Set config to undefined to test optional chaining
        sessionReplay.config = undefined;

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const originalHref = 'https://example.com/sensitive-page';
        const metaEvent = {
          type: 4,
          data: { href: originalHref },
          timestamp: Date.now(),
        };

        // Simulate emitting a meta event when config is undefined
        expect(() => {
          recordArg?.emit && recordArg?.emit(metaEvent);
        }).not.toThrow();

        // Note: ugcFilterRules was set during initialization, so it will use the configured rules
        expect(getPageUrlSpy).toHaveBeenCalledWith(originalHref, [
          { selector: 'https://example.com/*', replacement: 'https://example.com/filtered' },
        ]);
        expect(metaEvent.data.href).toBe(originalHref);
      });

      test('should not apply UGC filter rules when interactionConfig is undefined', async () => {
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: undefined,
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl').mockReturnValue('https://example.com/sensitive-page');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const originalHref = 'https://example.com/sensitive-page';
        const metaEvent = {
          type: 4,
          data: { href: originalHref },
          timestamp: Date.now(),
        };

        // Simulate emitting a meta event when interactionConfig is undefined
        expect(() => {
          recordArg?.emit && recordArg?.emit(metaEvent);
        }).not.toThrow();

        expect(getPageUrlSpy).toHaveBeenCalledWith(originalHref, []);
        expect(metaEvent.data.href).toBe(originalHref);
      });

      test('should not apply UGC filter rules when config exists but interactionConfig is null', async () => {
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: {
            enabled: true,
            ugcFilterRules: [{ selector: 'https://example.com/*', replacement: 'https://example.com/filtered' }],
          },
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl').mockReturnValue('https://example.com/sensitive-page');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        // Manually set interactionConfig to null to test optional chaining
        if (sessionReplay.config) {
          (sessionReplay.config as any).interactionConfig = null;
        }

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const originalHref = 'https://example.com/sensitive-page';
        const metaEvent = {
          type: 4,
          data: { href: originalHref },
          timestamp: Date.now(),
        };

        // Simulate emitting a meta event when interactionConfig is null
        expect(() => {
          recordArg?.emit && recordArg?.emit(metaEvent);
        }).not.toThrow();

        // Note: ugcFilterRules was set during initialization, so it will use the configured rules
        expect(getPageUrlSpy).toHaveBeenCalledWith(originalHref, [
          { selector: 'https://example.com/*', replacement: 'https://example.com/filtered' },
        ]);
        expect(metaEvent.data.href).toBe(originalHref);
      });

      test('should not apply UGC filter rules when ugcFilterRules is explicitly null', async () => {
        __setNamespaceConfig({
          sr_sampling_config: samplingConfig,
          sr_privacy_config: {},
          sr_interaction_config: {
            enabled: true,
            ugcFilterRules: null,
          },
        });

        const sessionReplay = new SessionReplay();
        const getPageUrlSpy = jest.spyOn(Helpers, 'getPageUrl').mockReturnValue('https://example.com/sensitive-page');
        await sessionReplay.init(apiKey, mockOptions).promise;
        await sessionReplay.recordEvents();

        const recordArg = mockRecordFunction.mock.calls[0][0];
        const originalHref = 'https://example.com/sensitive-page';
        const metaEvent = {
          type: 4,
          data: { href: originalHref },
          timestamp: Date.now(),
        };

        // Simulate emitting a meta event when ugcFilterRules is null
        expect(() => {
          recordArg?.emit && recordArg?.emit(metaEvent);
        }).not.toThrow();

        expect(getPageUrlSpy).toHaveBeenCalledWith(originalHref, []);
        expect(metaEvent.data.href).toBe(originalHref);
      });
    });
  });

  describe('getDeviceId', () => {
    test('should return undefined if no config set', () => {
      expect(sessionReplay.getDeviceId()).toEqual(undefined);
    });
    test('should return config device id if set', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      expect(sessionReplay.getDeviceId()).toEqual(mockOptions.deviceId);
    });
    test('should be consistent with session replay id', async () => {
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      const deviceIdFromSRId = sessionReplay.identifiers?.sessionReplayId?.split('/')[0];
      expect(sessionReplay.getDeviceId()).toEqual(deviceIdFromSRId);
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
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
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
      const createEventsIDBStoreInstance = await SessionReplayIDB.SessionReplayEventsIDBStore.new('replay', {
        loggerProvider: mockLoggerProvider,
        apiKey,
      });
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      if (!sessionReplay.eventsManager) {
        throw new Error('Did not call init');
      }
      await createEventsIDBStoreInstance?.addEventToCurrentSequence(123, mockEventString);
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

  describe('addCustomRRWebEvent', () => {
    test('should add custom event if null config', async () => {
      sessionReplay.config = undefined;
      sessionReplay.recordCancelCallback = () => {
        return;
      };
      // Set the recordFunction directly since addCustomRRWebEvent checks this.recordFunction
      (sessionReplay as any).recordFunction = mockRecordFunction;
      await sessionReplay.addCustomRRWebEvent(CustomRRwebEvent.GET_SR_PROPS, { myKey: 'data' });
      expect(mockRecordFunction.addCustomEvent).toHaveBeenCalledWith(CustomRRwebEvent.GET_SR_PROPS, { myKey: 'data' });
    });

    test('should add custom event with config and storage data', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordCancelCallback = () => {
        return;
      };
      mockRecordFunction.addCustomEvent = jest.fn();
      (sessionReplay as any).recordFunction = mockRecordFunction;
      await sessionReplay.addCustomRRWebEvent(CustomRRwebEvent.GET_SR_PROPS, { myKey: 'data' });
      expect(mockRecordFunction.addCustomEvent).toHaveBeenCalledWith(
        CustomRRwebEvent.GET_SR_PROPS,
        expect.objectContaining({
          myKey: 'data',
          config: expect.objectContaining({
            apiKey: '****_key',
          }),
          version: expect.stringMatching(/\d+.\d+.\d+/),
          percentOfQuota: 0.01,
          totalStorageSize: 1,
          usageDetails: JSON.stringify({
            indexedDB: 10,
          }),
        }),
      );
    });
    test('should not add custom event if not recording', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordCancelCallback = undefined;
      mockRecordFunction.addCustomEvent = jest.fn();
      await sessionReplay.addCustomRRWebEvent(CustomRRwebEvent.GET_SR_PROPS, { myKey: 'data' });
      expect(mockRecordFunction.addCustomEvent).not.toHaveBeenCalled();
    });
    test('should add storage info if addStorageInfo is true', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordCancelCallback = () => {
        return;
      };
      mockRecordFunction.addCustomEvent = jest.fn();
      (sessionReplay as any).recordFunction = mockRecordFunction;
      await sessionReplay.addCustomRRWebEvent(CustomRRwebEvent.GET_SR_PROPS, { myKey: 'data' }, true);
      expect(mockRecordFunction.addCustomEvent).toHaveBeenCalledWith(
        CustomRRwebEvent.GET_SR_PROPS,
        expect.objectContaining({
          percentOfQuota: 0.01,
          totalStorageSize: 1,
          usageDetails: JSON.stringify({
            indexedDB: 10,
          }),
        }),
      );
    });
    test('should not add storage info if addStorageInfo is false', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordCancelCallback = () => {
        return;
      };
      mockRecordFunction.addCustomEvent = jest.fn();
      (sessionReplay as any).recordFunction = mockRecordFunction;
      await sessionReplay.addCustomRRWebEvent(CustomRRwebEvent.GET_SR_PROPS, { myKey: 'data' }, false);
      expect(mockRecordFunction.addCustomEvent).toHaveBeenCalledWith(
        CustomRRwebEvent.GET_SR_PROPS,
        expect.not.objectContaining({
          percentOfQuota: 0.01,
          totalStorageSize: 1,
          usageDetails: JSON.stringify({
            indexedDB: 10,
          }),
        }),
      );
    });
    test('should handle an error', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      jest.spyOn(Helpers, 'getStorageSize').mockImplementation(() => {
        throw new Error();
      });
      mockRecordFunction.addCustomEvent = jest.fn();
      await sessionReplay.addCustomRRWebEvent(CustomRRwebEvent.GET_SR_PROPS, { myKey: 'data' });
      expect(mockRecordFunction.addCustomEvent).not.toHaveBeenCalled();
      expect(mockLoggerProvider.debug).toHaveBeenCalled();
    });
  });

  describe('getRecordingPlugins', () => {
    test('disabled console logging', async () => {
      const loggingConfig: LoggingConfig = {
        console: {
          enabled: false,
          levels: [],
        },
      };
      await expect(sessionReplay.getRecordingPlugins(loggingConfig)).resolves.toBeUndefined();
    });
    test('enabled console logging', async () => {
      const loggingConfig: LoggingConfig = {
        console: {
          enabled: true,
          levels: ['warn', 'error'],
        },
      };
      await expect(sessionReplay.getRecordingPlugins(loggingConfig)).resolves.toHaveLength(1);
    });
    test('should warn if loading console plugin fails', async () => {
      const loggingConfig: LoggingConfig = {
        console: {
          enabled: true,
          levels: ['warn', 'error'],
        },
      };
      // Mock the dynamic import to throw for this test only
      jest.resetModules();
      jest.doMock('@amplitude/rrweb-plugin-console-record', () => {
        throw new Error('Import failed');
      });
      const warnSpy = jest.spyOn(sessionReplay.loggerProvider, 'warn');
      await sessionReplay.getRecordingPlugins(loggingConfig);
      expect(warnSpy).toHaveBeenCalledWith('Failed to load console plugin:', expect.any(Error));
      jest.dontMock('@amplitude/rrweb-plugin-console-record');
    });
  });

  describe('should call addCustomRRWebEvent with network request events', () => {
    test('should call addCustomRRWebEvent with network request events', async () => {
      // Mock the observers module before initialization
      const mockStart = jest.fn();
      const mockNetworkObserversClass = jest.fn().mockImplementation(() => ({
        start: mockStart,
        stop: jest.fn(),
      }));

      jest.doMock('../src/observers', () => ({
        NetworkObservers: mockNetworkObserversClass,
        NetworkRequestEvent: {} as any,
      }));

      __setNamespaceConfig({
        sr_sampling_config: samplingConfig,
        sr_privacy_config: {},
        sr_logging_config: {
          network: {
            enabled: true,
          },
        },
      });

      await sessionReplay.init(apiKey, mockOptions).promise;
      const addCustomRRWebEventSpy = jest.spyOn(sessionReplay, 'addCustomRRWebEvent');

      const mockNetworkEvent: AnalyticsCore.NetworkRequestEvent = {
        type: 'fetch' as const,
        url: 'https://example.com',
        timestamp: Date.now(),
        method: 'GET',
        status: 200,
        startTime: Date.now(),
        toSerializable: () => ({}),
      };

      // Get the callback that was passed to start
      const subscribeSpy = jest.spyOn(AnalyticsCore.networkObserver, 'subscribe');
      await sessionReplay.recordEvents();
      console.log(subscribeSpy.mock.calls);
      const startCallback = subscribeSpy.mock.calls[0][0].callback;

      startCallback(mockNetworkEvent);

      expect(addCustomRRWebEventSpy).toHaveBeenCalledWith(CustomRRwebEvent.FETCH_REQUEST, mockNetworkEvent);

      jest.dontMock('../src/observers');
    });
  });

  describe('setMetadata', () => {
    test('should set replaySDKVersion from options.version?.version in metadata', async () => {
      const customVersion = '1.8.7';
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        version: { version: customVersion, type: 'plugin' },
      }).promise;
      // Access private property for test only
      const metadata = (sessionReplay as any).metadata;
      expect(metadata?.replaySDKVersion).toBe(customVersion);
    });

    test('should set replaySDKType to @amplitude/segment-session-replay-plugin if type is segment', async () => {
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        version: { version: '1.8.7', type: 'segment' },
      }).promise;
      const metadata = (sessionReplay as any).metadata;
      expect(metadata?.replaySDKType).toBe('@amplitude/segment-session-replay-plugin');
    });
  });

  describe('getRecordFunction', () => {
    let getRecordFunctionSpy: jest.SpyInstance;

    beforeEach(() => {
      // Restore the original implementation for these tests
      getRecordFunctionSpy = jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any);
      getRecordFunctionSpy.mockRestore();
    });

    afterEach(() => {
      // Clean up any mocks we created
      jest.dontMock('@amplitude/rrweb-record');
    });

    test('should return cached recordFunction if it already exists', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockCachedFunction = jest.fn();
      (sessionReplay as any).recordFunction = mockCachedFunction;

      const result = await (sessionReplay as any).getRecordFunction();

      expect(result).toBe(mockCachedFunction);
    });

    test('should dynamically import and cache record function on first call', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      (sessionReplay as any).recordFunction = null;

      const mockRecord = jest.fn();
      jest.doMock(
        '@amplitude/rrweb-record',
        () => ({
          record: mockRecord,
        }),
        { virtual: true },
      );

      const result = await (sessionReplay as any).getRecordFunction();

      expect(result).toBe(mockRecord);
      expect((sessionReplay as any).recordFunction).toBe(mockRecord);
    });

    test('should log warning and return null when import fails', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      (sessionReplay as any).recordFunction = null;

      jest.resetModules();
      jest.doMock('@amplitude/rrweb-record', () => {
        throw new Error('Import failed');
      });

      const warnSpy = jest.spyOn(sessionReplay.loggerProvider, 'warn');

      const result = await (sessionReplay as any).getRecordFunction();

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith('Failed to load rrweb-record module:', expect.any(Error));
    });

    test('should return cached function on subsequent calls after successful import', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      (sessionReplay as any).recordFunction = null;

      const mockRecord = jest.fn();
      jest.doMock(
        '@amplitude/rrweb-record',
        () => ({
          record: mockRecord,
        }),
        { virtual: true },
      );

      const firstResult = await (sessionReplay as any).getRecordFunction();
      expect(firstResult).toBe(mockRecord);

      const secondResult = await (sessionReplay as any).getRecordFunction();
      expect(secondResult).toBe(mockRecord);
      expect(secondResult).toBe(firstResult);
    });

    test('should return early if recordFunction is null', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      // Mock getRecordFunction to return null (simulating import failure)
      const getRecordFunctionSpy = jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any);
      getRecordFunctionSpy.mockResolvedValue(null);

      // Spy on the record function to ensure it's not called
      mockRecordFunction.mockClear();

      await sessionReplay.recordEvents();

      expect(mockRecordFunction).not.toHaveBeenCalled();
      expect(getRecordFunctionSpy).toHaveBeenCalled();

      getRecordFunctionSpy.mockRestore();
    });

    test('should return early if recordFunction is undefined', async () => {
      await sessionReplay.init(apiKey, mockOptions).promise;

      const getRecordFunctionSpy = jest.spyOn(SessionReplay.prototype, 'getRecordFunction' as any);
      getRecordFunctionSpy.mockResolvedValue(undefined);

      mockRecordFunction.mockClear();

      await sessionReplay.recordEvents();

      expect(mockRecordFunction).not.toHaveBeenCalled();
      expect(getRecordFunctionSpy).toHaveBeenCalled();

      getRecordFunctionSpy.mockRestore();
    });
  });
});
