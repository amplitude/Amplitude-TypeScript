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
      sessionId: 12345,
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

    // getSessionId() returns the numeric the consumer set, resolved from JS
    // state — the native numeric session API is no longer called.
    const sessionId = await getSessionId();
    expect(sessionId).toBe(12345);
    expect(mockNativeModules.AMPNativeSessionReplay.getSessionId).not.toHaveBeenCalled();

    await stop();
    expect(mockNativeModules.AMPNativeSessionReplay.stop).toHaveBeenCalled();

    await setOptOut(true);
    expect(mockNativeModules.AMPNativeSessionReplay.setOptOut).toHaveBeenCalledWith(true);

    await teardown();
    expect(mockNativeModules.AMPNativeSessionReplay.teardown).toHaveBeenCalled();

    const calls = jest.mocked(mockNativeModules.AMPNativeSessionReplay);
    expect(calls.setup).toHaveBeenCalled();
    expect(calls.start).toHaveBeenCalled();
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

  describe('custom session ID', () => {
    const CUSTOM_ID = '550e8400-e29b-41d4-a716-446655440000';

    const runInIsolatedModule = async (
      fn: (api: typeof import('../src/index')) => Promise<void>,
    ): Promise<jest.Mocked<(typeof NativeModules)['AMPNativeSessionReplay']>> => {
      let nativeModule!: jest.Mocked<(typeof NativeModules)['AMPNativeSessionReplay']>;
      let pending!: Promise<void>;
      jest.isolateModules(() => {
        const api = require('../src/index') as typeof import('../src/index');
        const { NativeModules: freshNativeModules } = require('react-native') as typeof import('react-native');
        nativeModule = (freshNativeModules as jest.Mocked<typeof NativeModules>).AMPNativeSessionReplay;
        pending = fn(api);
      });
      await pending;
      return nativeModule;
    };

    it('forwards a string customSessionId at init (winning over the numeric sessionId) and never sends a native numeric sessionId', async () => {
      const nativeModule = await runInIsolatedModule(async ({ init: freshInit }) => {
        await freshInit({
          apiKey: 'test-api-key',
          sessionId: 42,
          customSessionId: CUSTOM_ID,
        });
      });

      expect(nativeModule.setup).toHaveBeenCalledWith(
        expect.objectContaining({
          customSessionId: CUSTOM_ID,
        }),
      );
      // The native layer no longer receives a numeric session id.
      const [setupConfig] = jest.mocked(nativeModule.setup).mock.calls[0] as [Record<string, unknown>];
      expect(setupConfig).not.toHaveProperty('sessionId');
    });

    it('maps a numeric-only sessionId onto the native customSessionId as a string', async () => {
      const nativeModule = await runInIsolatedModule(async ({ init: freshInit }) => {
        await freshInit({ apiKey: 'test-api-key', sessionId: 99 });
      });

      const [setupConfig] = jest.mocked(nativeModule.setup).mock.calls[0] as [Record<string, unknown>];
      expect(setupConfig).toMatchObject({ customSessionId: '99' });
      expect(setupConfig).not.toHaveProperty('sessionId');
    });

    it('omits customSessionId from native setup when neither a custom nor a numeric session id is set', async () => {
      const nativeModule = await runInIsolatedModule(async ({ init: freshInit }) => {
        await freshInit({ apiKey: 'test-api-key' });
      });

      const [setupConfig] = jest.mocked(nativeModule.setup).mock.calls[0] as [Record<string, unknown>];
      expect(setupConfig).not.toHaveProperty('customSessionId');
      expect(setupConfig).not.toHaveProperty('sessionId');
    });

    it('forwards setCustomSessionId and getCustomSessionId after init', async () => {
      const nativeModule = await runInIsolatedModule(
        async ({ init: freshInit, setCustomSessionId: setCustom, getCustomSessionId: getCustom }) => {
          await freshInit({ apiKey: 'test-api-key' });
          await setCustom(CUSTOM_ID);
          const id = await getCustom();
          expect(id).toBe(CUSTOM_ID);
        },
      );

      expect(nativeModule.setCustomSessionId).toHaveBeenCalledWith(CUSTOM_ID);
      expect(nativeModule.getCustomSessionId).toHaveBeenCalled();
    });

    it('routes runtime setSessionId onto the native customSessionId as a string', async () => {
      const nativeModule = await runInIsolatedModule(async ({ init: freshInit, setSessionId: setNumeric }) => {
        await freshInit({ apiKey: 'test-api-key' });
        await setNumeric(1234567890);
      });

      expect(nativeModule.setCustomSessionId).toHaveBeenCalledWith('1234567890');
      // The RN SDK never drives the native numeric session id.
      expect(nativeModule.setSessionId).not.toHaveBeenCalled();
    });

    it('preserves the getSessionId() contract from JS state without calling the native numeric getter', async () => {
      const observed: Array<number | null> = [];
      const nativeModule = await runInIsolatedModule(
        async ({
          init: freshInit,
          setSessionId: setNumeric,
          setCustomSessionId: setCustom,
          getSessionId: getNumeric,
        }) => {
          // init with a numeric session id -> getSessionId returns it
          await freshInit({ apiKey: 'test-api-key', sessionId: 777 });
          observed.push(await getNumeric());
          // a string custom id makes getSessionId report -1
          await setCustom(CUSTOM_ID);
          observed.push(await getNumeric());
          // a later numeric setSessionId is reflected again
          await setNumeric(888);
          observed.push(await getNumeric());
        },
      );

      expect(observed).toEqual([777, -1, 888]);
      expect(nativeModule.getSessionId).not.toHaveBeenCalled();
    });

    it('reports -1 from getSessionId() when a custom session id is supplied at init', async () => {
      let observed: number | null = 0;
      await runInIsolatedModule(async ({ init: freshInit, getSessionId: getNumeric }) => {
        await freshInit({ apiKey: 'test-api-key', sessionId: 123, customSessionId: CUSTOM_ID });
        observed = await getNumeric();
      });

      expect(observed).toBe(-1);
    });

    it('does not call custom session native methods before initialization', async () => {
      const nativeModule = await runInIsolatedModule(
        async ({ setCustomSessionId: setCustom, getCustomSessionId: getCustom }) => {
          await setCustom(CUSTOM_ID);
          const id = await getCustom();
          expect(id).toBeNull();
        },
      );

      expect(nativeModule.setCustomSessionId).not.toHaveBeenCalled();
      expect(nativeModule.getCustomSessionId).not.toHaveBeenCalled();
    });

    it('preserves custom session ID forwarding across opt-out toggle', async () => {
      const nativeModule = await runInIsolatedModule(async ({ init: freshInit, setOptOut: freshSetOptOut }) => {
        await freshInit({
          apiKey: 'test-api-key',
          customSessionId: CUSTOM_ID,
        });
        await freshSetOptOut(true);
        await freshSetOptOut(false);
      });

      expect(nativeModule.setup).toHaveBeenCalledWith(expect.objectContaining({ customSessionId: CUSTOM_ID }));
      expect(nativeModule.setOptOut).toHaveBeenCalledTimes(2);
    });

    it('allows re-init after teardown with a new custom session ID', async () => {
      const nativeModule = await runInIsolatedModule(async ({ init: freshInit, teardown: freshTeardown }) => {
        await freshInit({ apiKey: 'test-api-key', customSessionId: CUSTOM_ID });
        await freshTeardown();
        await freshInit({ apiKey: 'test-api-key', customSessionId: 'second-custom-id' });
      });

      expect(nativeModule.setup).toHaveBeenCalledTimes(2);
      expect(nativeModule.setup).toHaveBeenLastCalledWith(
        expect.objectContaining({ customSessionId: 'second-custom-id' }),
      );
      expect(nativeModule.teardown).toHaveBeenCalled();
    });
  });
});
