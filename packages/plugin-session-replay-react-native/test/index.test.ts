// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-var-requires */

// Use the mock from the local __mocks__ directory. The plugin now delegates to
// the standalone package, which talks to the `AMPNativeSessionReplay` native
// module, so the mock provides that surface.
jest.mock('react-native');

import type { SessionReplayConfig, SessionReplayPluginConfig, PrivacyConfig } from '../src/index';
import { LogLevel } from '@amplitude/analytics-types';
import type { ReactNativeConfig } from '@amplitude/analytics-types';
import mockReactNativeClient from './utils/reactNativeClient';

const minimalConfig: ReactNativeConfig = {
  apiKey: 'test-api-key',
  serverZone: 'US',
  deviceId: 'test-device-id',
  sessionId: 12345,
  userId: 'test-user-id',
  optOut: false,
  cookieExpiration: 0,
  cookieSameSite: 'Lax',
  cookieSecure: false,
  cookieStorage: undefined as never,
  cookieUpgrade: false,
  disableCookies: false,
  domain: 'test.com',
  sessionTimeout: 1800000,
  trackingOptions: {},
  flushIntervalMillis: 10000,
  flushMaxRetries: 5,
  flushQueueSize: 10,
  logLevel: LogLevel.Warn,
  loggerProvider: undefined as never,
  transportProvider: undefined as never,
  useBatch: false,
  attribution: undefined,
  serverUrl: undefined,
  appVersion: undefined,
  lastEventTime: undefined,
  lastEventId: undefined,
  partnerId: undefined,
  trackingSessionEvents: undefined,
  migrateLegacyData: undefined,
};

describe('plugin-session-replay-react-native public API', () => {
  // The standalone's `session-replay.ts` keeps `isInitialized` in module scope,
  // so each test resets modules and re-requires a fresh plugin paired with the
  // fresh `react-native` mock it actually calls into.
  let SessionReplayPlugin: typeof import('../src/index').SessionReplayPlugin;
  let AmpMaskView: typeof import('../src/index').AmpMaskView;
  let nativeModule: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.resetModules();
    const index = require('../src/index');
    SessionReplayPlugin = index.SessionReplayPlugin;
    AmpMaskView = index.AmpMaskView;
    nativeModule = require('react-native').NativeModules.AMPNativeSessionReplay;
    jest.clearAllMocks();
    nativeModule.getSessionReplayProperties.mockResolvedValue({ replayId: 'test-id' });
  });

  describe('re-exported surface', () => {
    it('re-exports the standalone SessionReplayPlugin class', () => {
      const plugin = new SessionReplayPlugin();
      expect(plugin).toBeInstanceOf(SessionReplayPlugin);
      expect(plugin.name).toBe('@amplitude/plugin-session-replay-react-native');
      expect(plugin.type).toBe('enrichment');
    });

    it('re-exports the standalone AmpMaskView bound to AMPMaskComponentView', () => {
      // After consolidation the only linked RN component is the standalone's
      // `AMPMaskComponentView` (not the old plugin-local `RCTAmpMaskView`).
      expect(AmpMaskView).toBe('AMPMaskComponentView');
    });

    it('keeps the deprecated SessionReplayConfig alias assignable to SessionReplayPluginConfig', () => {
      const legacy: SessionReplayConfig = { sampleRate: 0.5, privacyConfig: { maskLevel: 'light' } };
      const current: SessionReplayPluginConfig = legacy;
      const privacy: PrivacyConfig = { maskLevel: 'conservative' };
      expect(current.sampleRate).toBe(0.5);
      expect(privacy.maskLevel).toBe('conservative');
    });
  });

  describe('SessionReplayPlugin lifecycle delegates to the standalone native module', () => {
    it('forwards setup with API config to AMPNativeSessionReplay', async () => {
      const plugin = new SessionReplayPlugin();
      await plugin.setup(minimalConfig, mockReactNativeClient);
      expect(nativeModule.setup).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'test-api-key', serverZone: 'US' }),
      );
    });

    it('threads privacyConfig.maskLevel through to native setup', async () => {
      const plugin = new SessionReplayPlugin({ privacyConfig: { maskLevel: 'conservative' } });
      await plugin.setup(minimalConfig, mockReactNativeClient);
      expect(nativeModule.setup).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'conservative' }));
    });

    it('defaults to medium masking when privacyConfig is not provided', async () => {
      const plugin = new SessionReplayPlugin();
      await plugin.setup(minimalConfig, mockReactNativeClient);
      expect(nativeModule.setup).toHaveBeenCalledWith(expect.objectContaining({ maskLevel: 'medium' }));
    });

    it('delegates start and stop to native, and teardown to native teardown (full shutdown)', async () => {
      const plugin = new SessionReplayPlugin();
      await plugin.setup(minimalConfig, mockReactNativeClient);
      await plugin.start();
      expect(nativeModule.start).toHaveBeenCalled();
      await plugin.stop();
      expect(nativeModule.stop).toHaveBeenCalledTimes(1);
      await plugin.teardown();
      // teardown must release native resources via the native `teardown`
      // (Android `shutdown()` / iOS `stop()`), NOT merely pause via `stop()`.
      // Pausing instead would leak native recording listeners on Android when
      // the plugin is removed at runtime (SDKRN-14 regression guard).
      expect(nativeModule.teardown).toHaveBeenCalledTimes(1);
      expect(nativeModule.stop).toHaveBeenCalledTimes(1);
    });

    it('enriches events with session replay properties once initialized', async () => {
      const plugin = new SessionReplayPlugin();
      await plugin.setup(minimalConfig, mockReactNativeClient);
      const event = { event_type: 'test_event', session_id: 12345, event_properties: {} };
      const enriched = await plugin.execute(event);
      expect(nativeModule.getSessionReplayProperties).toHaveBeenCalled();
      expect(enriched?.event_properties).toEqual(expect.objectContaining({ replayId: 'test-id' }));
    });
  });
});
