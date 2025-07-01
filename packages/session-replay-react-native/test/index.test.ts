// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

// Use the mock from __mocks__ directory
jest.mock('react-native');

// Explicitly mock the logger module using the imported mock
jest.mock('../src/logger', (): any => require('./utils/logger'));

import {
  init,
  setSessionId,
  getSessionId,
  getSessionReplayProperties,
  flush,
  start,
  stop,
  setDeviceId,
  SessionReplayPlugin,
  AmpMaskView,
  type SessionReplayConfig,
  type SessionReplayPluginConfig,
  MaskLevel,
} from '../src/index';
import { NativeModules } from 'react-native';
import { LogLevel } from '@amplitude/analytics-types';

// Mock the getSessionReplayProperties return value for our tests
NativeModules.AMPNativeSessionReplay.getSessionReplayProperties.mockResolvedValue({ replayId: 'test-id' });

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
    });

    it('should export setSessionId function that updates session ID', async () => {
      const testSessionId = 54321;
      await init(testConfig); // Initialize first
      await setSessionId(testSessionId);
      expect(NativeModules.AMPNativeSessionReplay.setSessionId).toHaveBeenCalledWith(testSessionId);
    });

    it('should export getSessionId function that retrieves session ID', async () => {
      await init(testConfig); // Initialize first
      const sessionId = await getSessionId();
      expect(NativeModules.AMPNativeSessionReplay.getSessionId).toHaveBeenCalled();
      expect(sessionId).toBe(12345);
    });

    it('should export getSessionReplayProperties function', async () => {
      await init(testConfig); // Initialize first
      const properties = await getSessionReplayProperties();
      expect(NativeModules.AMPNativeSessionReplay.getSessionReplayProperties).toHaveBeenCalled();
      expect(properties).toEqual({ replayId: 'test-id' });
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
    it('should export SessionReplayPlugin class', () => {
      const plugin = new SessionReplayPlugin();
      expect(plugin).toBeInstanceOf(SessionReplayPlugin);
      expect(plugin.name).toBe('@amplitude/plugin-session-replay-react-native');
      expect(plugin.type).toBe('enrichment');
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
        maskLevel: MaskLevel.Medium,
        autoStart: true,
        deviceId: 'test-device',
        enableRemoteConfig: true,
        optOut: false,
        sampleRate: 1,
        sessionId: 12345,
      };
      // TypeScript compilation is the test - if it compiles, the interface is correct
      expect(config).toBeTruthy();
    });

    it('should export SessionReplayPluginConfig interface', () => {
      const config: SessionReplayPluginConfig = {
        sampleRate: 1,
        enableRemoteConfig: true,
        logLevel: LogLevel.Warn,
        autoStart: true,
      };
      // TypeScript compilation is the test - if it compiles, the interface is correct
      expect(config).toBeTruthy();
    });

    it('should export MaskLevel enum', () => {
      expect(MaskLevel.Light).toBe('light');
      expect(MaskLevel.Medium).toBe('medium');
      expect(MaskLevel.Conservative).toBe('conservative');
      expect(Object.keys(MaskLevel)).toHaveLength(3);
    });
  });
});
