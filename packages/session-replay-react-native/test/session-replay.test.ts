// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */

jest.mock('react-native');

jest.mock('../src/logger', () => require('./utils/logger'));

import { init, start, stop, getSessionId, teardown, setOptOut, type SessionReplayConfig } from '../src/index';
import { NativeModules } from 'react-native';
import { LogLevel } from '@amplitude/analytics-types';
import { readFileSync } from 'fs';
import { join } from 'path';

const mockNativeModules = NativeModules as jest.Mocked<typeof NativeModules>;

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
    const [setupConfig] = jest.mocked(mockNativeModules.AMPNativeSessionReplay.setup).mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(Object.keys(setupConfig)).not.toContain('autoStart');

    await start();
    expect(mockNativeModules.AMPNativeSessionReplay.start).toHaveBeenCalled();

    const sessionId = await getSessionId();
    expect(sessionId).toBe(12345);
    expect(mockNativeModules.AMPNativeSessionReplay.getSessionId).toHaveBeenCalled();

    await stop();
    expect(mockNativeModules.AMPNativeSessionReplay.stop).toHaveBeenCalled();

    await setOptOut(true);
    expect(mockNativeModules.AMPNativeSessionReplay.setOptOut).toHaveBeenCalledWith(true);

    await teardown();
    expect(mockNativeModules.AMPNativeSessionReplay.teardown).toHaveBeenCalled();

    const calls = jest.mocked(mockNativeModules.AMPNativeSessionReplay);
    expect(calls.setup).toHaveBeenCalled();
    expect(calls.start).toHaveBeenCalled();
    expect(calls.getSessionId).toHaveBeenCalled();
    expect(calls.stop).toHaveBeenCalled();
    expect(calls.setOptOut).toHaveBeenCalled();
    expect(calls.teardown).toHaveBeenCalled();
  });

  it('clears JS state during teardown so the SDK can be initialized again', async () => {
    let pending!: Promise<void>;
    let setupMock!: jest.Mock;
    jest.isolateModules(() => {
      const {
        init: freshInit,
        teardown: freshTeardown,
        start: freshStart,
      } = require('../src/index') as typeof import('../src/index');
      const { NativeModules: freshNativeModules } = require('react-native') as typeof import('react-native');
      setupMock = (freshNativeModules as jest.Mocked<typeof NativeModules>).AMPNativeSessionReplay.setup;
      pending = (async () => {
        await freshInit({ apiKey: 'first-api-key' });
        await freshTeardown();
        await freshStart();
        await freshInit({ apiKey: 'second-api-key' });
      })();
    });

    await pending;
    expect(setupMock).toHaveBeenCalledTimes(2);
    expect(setupMock).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: 'second-api-key' }));
  });

  it('does not call native lifecycle methods before initialization', async () => {
    let pending!: Promise<void>;
    let nativeModule!: jest.Mocked<(typeof NativeModules)['AMPNativeSessionReplay']>;
    jest.isolateModules(() => {
      const { teardown: freshTeardown, setOptOut: freshSetOptOut } =
        require('../src/index') as typeof import('../src/index');
      const { NativeModules: freshNativeModules } = require('react-native') as typeof import('react-native');
      nativeModule = (freshNativeModules as jest.Mocked<typeof NativeModules>).AMPNativeSessionReplay;
      pending = (async () => {
        await freshSetOptOut(true);
        await freshTeardown();
      })();
    });

    await pending;
    expect(nativeModule.setOptOut).not.toHaveBeenCalled();
    expect(nativeModule.teardown).not.toHaveBeenCalled();
  });

  describe('nullable device ID contract', () => {
    it('forwards a null device ID during initialization', async () => {
      let pending!: Promise<void>;
      let setupMock!: jest.Mock;
      jest.isolateModules(() => {
        const { init: freshInit } = require('../src/index') as typeof import('../src/index');
        const { NativeModules: freshNativeModules } = require('react-native') as typeof import('react-native');
        setupMock = (freshNativeModules as jest.Mocked<typeof NativeModules>).AMPNativeSessionReplay.setup;
        pending = freshInit({ apiKey: 'test-api-key', deviceId: null });
      });

      await pending;
      expect(setupMock).toHaveBeenCalledWith(expect.objectContaining({ deviceId: null }));
      expect(setupMock).not.toHaveBeenCalledWith(expect.objectContaining({ deviceId: '' }));
    });

    it('forwards null when clearing the device ID', async () => {
      let pending!: Promise<void>;
      let setDeviceIdMock!: jest.Mock;
      jest.isolateModules(() => {
        const { init: freshInit, setDeviceId: freshSetDeviceId } =
          require('../src/index') as typeof import('../src/index');
        const { NativeModules: freshNativeModules } = require('react-native') as typeof import('react-native');
        setDeviceIdMock = (freshNativeModules as jest.Mocked<typeof NativeModules>).AMPNativeSessionReplay.setDeviceId;
        pending = (async () => {
          await freshInit({ apiKey: 'test-api-key' });
          await freshSetDeviceId(null);
        })();
      });

      await pending;
      expect(setDeviceIdMock).toHaveBeenCalledWith(null);
      expect(setDeviceIdMock).not.toHaveBeenCalledWith('');
    });

    it('keeps the Android bridge nullable without empty-string coercion', () => {
      const source = readFileSync(
        join(
          __dirname,
          '../android/src/main/java/com/amplitude/sessionreplayreactnative/SessionReplayReactNativeModule.kt',
        ),
        'utf8',
      );

      expect(source).toContain('sessionReplay?.setDeviceId(deviceId)');
      expect(source).toContain('deviceId = config.deviceId,');
      expect(source).not.toContain('deviceId ?: ""');
      expect(source).not.toContain('config.deviceId ?: ""');
    });

    it('declares the iOS setDeviceId bridge parameter nullable', () => {
      const swiftSource = readFileSync(join(__dirname, '../ios/NativeSessionReplay.swift'), 'utf8');
      const objcSource = readFileSync(join(__dirname, '../ios/AMPNativeSessionReplay.mm'), 'utf8');

      expect(swiftSource).toContain('func setDeviceId(_ deviceId: NSString?');
      expect(objcSource).toContain('setDeviceId:(nullable NSString *)deviceId');
    });
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
        maskLevel: 'conservative',
      });

      expect(setupMock).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'conservative' }));
    });

    it('prefers `privacyConfig.maskLevel` over the deprecated `maskLevel` when both are provided', async () => {
      const setupMock = await runInIsolatedModule({
        apiKey: 'test-api-key',
        maskLevel: 'conservative',
        privacyConfig: { maskLevel: 'light' },
      });

      expect(setupMock).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'light' }));
    });

    it('defaults to `Medium` when neither `privacyConfig.maskLevel` nor the deprecated `maskLevel` is set', async () => {
      const setupMock = await runInIsolatedModule({
        apiKey: 'test-api-key',
      });

      expect(setupMock).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'medium' }));
    });

    it('falls back to `medium` when an explicit empty `privacyConfig` omits `maskLevel`', async () => {
      const setupMock = await runInIsolatedModule({
        apiKey: 'test-api-key',
        privacyConfig: {},
      });

      expect(setupMock).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'medium' }));
    });

    it('forwards a user-supplied `privacyConfig.maskLevel` to the native module without the default overwriting it', async () => {
      const setupMock = await runInIsolatedModule({
        apiKey: 'test-api-key',
        privacyConfig: { maskLevel: 'conservative' },
      });

      expect(setupMock).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'conservative' }));
    });

    it('does not pass the internal `privacyConfig` object through to the native module', async () => {
      const setupMock = await runInIsolatedModule({
        apiKey: 'test-api-key',
        privacyConfig: { maskLevel: 'light' },
      });

      expect(setupMock).toHaveBeenCalledWith(expect.not.objectContaining({ privacyConfig: expect.anything() }));
    });
  });
});
