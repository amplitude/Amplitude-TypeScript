// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */

jest.mock('react-native');

jest.mock('../src/logger', () => require('./utils/logger'));

import {
  init,
  start,
  stop,
  getSessionId,
  getSessionReplayProperties,
  MaskLevel,
  type SessionReplayConfig,
} from '../src/index';
import { NativeModules } from 'react-native';
import { LogLevel } from '@amplitude/analytics-types';

const mockNativeModules = NativeModules as jest.Mocked<typeof NativeModules>;
mockNativeModules.AMPNativeSessionReplay.getSessionReplayProperties.mockResolvedValue({ replayId: 'test-id' });

describe('Session Replay Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('should allow complete workflow using exported functions', async () => {
    const testConfig: SessionReplayConfig = {
      apiKey: 'test-api-key',
      serverZone: 'US',
      logLevel: LogLevel.Warn,
    };

    await init(testConfig);
    expect(mockNativeModules.AMPNativeSessionReplay.setup).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-api-key',
        serverZone: 'US',
        logLevel: LogLevel.Warn,
      }),
    );

    await start();
    expect(mockNativeModules.AMPNativeSessionReplay.start).toHaveBeenCalled();

    const sessionId = await getSessionId();
    expect(sessionId).toBe(12345);
    expect(mockNativeModules.AMPNativeSessionReplay.getSessionId).toHaveBeenCalled();

    const properties = await getSessionReplayProperties();
    expect(properties).toEqual({ replayId: 'test-id' });
    expect(mockNativeModules.AMPNativeSessionReplay.getSessionReplayProperties).toHaveBeenCalled();

    await stop();
    expect(mockNativeModules.AMPNativeSessionReplay.stop).toHaveBeenCalled();

    const calls = jest.mocked(mockNativeModules.AMPNativeSessionReplay);
    expect(calls.setup).toHaveBeenCalled();
    expect(calls.start).toHaveBeenCalled();
    expect(calls.getSessionId).toHaveBeenCalled();
    expect(calls.getSessionReplayProperties).toHaveBeenCalled();
    expect(calls.stop).toHaveBeenCalled();
  });

  // These tests cover the resolution chain in `nativeConfig()` for the
  // deprecated top-level `maskLevel` field alongside `privacyConfig.maskLevel`.
  // `init()` keeps `isInitialized` in module scope, so each test uses
  // `jest.isolateModules` to get a fresh `init` paired with the fresh
  // `react-native` mock instance it actually calls into.
  describe('maskLevel resolution', () => {
    const runInIsolatedModule = async (config: SessionReplayConfig): Promise<jest.Mock> => {
      let setupMock!: jest.Mock;
      let pending!: Promise<void>;
      jest.isolateModules(() => {
        const { init: freshInit } = require('../src/index') as typeof import('../src/index');
        const { NativeModules: freshNativeModules } = require('react-native') as typeof import('react-native');
        setupMock = (freshNativeModules as jest.Mocked<typeof NativeModules>).AMPNativeSessionReplay.setup;
        pending = freshInit(config);
      });
      await pending;
      return setupMock;
    };

    it('forwards the deprecated `maskLevel` to the native module when no `privacyConfig` is provided', async () => {
      const setupMock = await runInIsolatedModule({
        apiKey: 'test-api-key',
        maskLevel: MaskLevel.Conservative,
      });

      expect(setupMock).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'conservative' }));
    });

    it('prefers `privacyConfig.maskLevel` over the deprecated `maskLevel` when both are provided', async () => {
      const setupMock = await runInIsolatedModule({
        apiKey: 'test-api-key',
        maskLevel: MaskLevel.Conservative,
        privacyConfig: { maskLevel: MaskLevel.Light },
      });

      expect(setupMock).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'light' }));
    });

    it('defaults to `Medium` when neither `privacyConfig.maskLevel` nor the deprecated `maskLevel` is set', async () => {
      const setupMock = await runInIsolatedModule({
        apiKey: 'test-api-key',
      });

      expect(setupMock).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'medium' }));
    });
  });
});
