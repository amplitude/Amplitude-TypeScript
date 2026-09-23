// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

// Use the mock from __mocks__ directory
jest.mock('react-native');

// Explicitly mock the logger module using the imported mock
jest.mock('../src/logger', (): any => require('./utils/logger'));

import * as sessionReplay from '../src/index';
import {
  init,
  setSessionId,
  getSessionId,
  flush,
  start,
  stop,
  setDeviceId,
  AmpMaskView,
  type SessionReplayConfig,
  type MaskLevel,
  LogLevel,
} from '../src/index';
import { NativeModules } from 'react-native';

describe('Index Exports', () => {
  const testConfig: SessionReplayConfig = {
    apiKey: 'test-api-key',
    serverZone: 'US',
    logLevel: LogLevel.Warn,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('Function Exports', () => {
    it('should export init function that initializes session replay', async () => {
      await init(testConfig);
      expect(NativeModules.AMPNativeSessionReplay.setup).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-api-key',
          serverZone: 'US',
          logLevel: LogLevel.Warn,
        }),
      );
      const [setupConfig] = NativeModules.AMPNativeSessionReplay.setup.mock.calls[0] as [Record<string, unknown>];
      expect(Object.keys(setupConfig)).not.toContain('autoStart');
    });

    it('should export setSessionId function that maps the numeric id onto the native custom session id', async () => {
      const testSessionId = 54321;
      await init(testConfig); // Initialize first
      await setSessionId(testSessionId);
      // The numeric session id is routed through the native customSessionId path
      // as its string form — the RN SDK never drives a native numeric session id.
      expect(NativeModules.AMPNativeSessionReplay.setCustomSessionId).toHaveBeenCalledWith(String(testSessionId));
    });

    it('should export getSessionId function that returns the numeric id set by the consumer', async () => {
      await init({ ...testConfig, sessionId: 54321 }); // Initialize with a numeric session id
      const sessionId = await getSessionId();
      expect(sessionId).toBe(54321);
    });

    it('should not export getSessionReplayProperties', () => {
      expect(sessionReplay).not.toHaveProperty('getSessionReplayProperties');
    });

    it('should export flush function that flushes session data', async () => {
      await init(testConfig); // Initialize first
      await flush();
      expect(NativeModules.AMPNativeSessionReplay.flush).toHaveBeenCalled();
    });

    it('should export start function that starts recording', async () => {
      await init(testConfig); // Initialize first
      await start();
      expect(NativeModules.AMPNativeSessionReplay.start).toHaveBeenCalled();
    });

    it('should export stop function that stops recording', async () => {
      await init(testConfig); // Initialize first
      await stop();
      expect(NativeModules.AMPNativeSessionReplay.stop).toHaveBeenCalled();
    });

    it('should export setDeviceId function that updates device ID', async () => {
      const testDeviceId = 'test-device-id';
      await init(testConfig); // Initialize first
      await setDeviceId(testDeviceId);
      expect(NativeModules.AMPNativeSessionReplay.setDeviceId).toHaveBeenCalledWith(testDeviceId);
    });
  });

  describe('Class Exports', () => {
    it('should not export SessionReplayPlugin', () => {
      expect(sessionReplay).not.toHaveProperty('SessionReplayPlugin');
    });

    it('should export AmpMaskView component', () => {
      expect(AmpMaskView).toBe('AMPMaskComponentView');
    });
  });

  describe('Type Exports', () => {
    it('should export SessionReplayConfig interface', () => {
      const config: SessionReplayConfig = {
        apiKey: 'test-api-key',
        serverZone: 'US',
        logLevel: LogLevel.Warn,
        maskLevel: 'medium',
        deviceId: 'test-device',
        enableRemoteConfig: true,
        optOut: false,
        sampleRate: 1,
        sessionId: 12345,
      };
      // TypeScript compilation is the test - if it compiles, the interface is correct
      expect(config).toBeTruthy();
    });

    it('should export MaskLevel type', () => {
      const level: MaskLevel = 'conservative';
      expect(level).toBe('conservative');
    });
  });

  describe('Enum Exports', () => {
    it('should export LogLevel as a runtime enum from the package entry', () => {
      expect(LogLevel.Warn).toBe(2);
      expect(LogLevel.None).toBe(0);
      expect(LogLevel.Error).toBe(1);
      expect(LogLevel.Verbose).toBe(3);
      expect(LogLevel.Debug).toBe(4);
    });
  });
});
