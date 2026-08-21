// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-var-requires */

// Use the mock from __mocks__ directory
jest.mock('react-native');

// Explicitly mock the logger module using the imported mock
jest.mock('../src/logger', () => require('./utils/logger'));

import type { SessionReplayPluginConfig } from '../src/index';
import { LogLevel } from '@amplitude/analytics-types';
import type { ReactNativeConfig } from '@amplitude/analytics-types';
import mockReactNativeClient from './utils/reactNativeClient';

// Minimal config with all required properties from ReactNativeConfig
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
  cookieStorage: undefined as any,
  cookieUpgrade: false,
  disableCookies: false,
  domain: 'test.com',
  sessionTimeout: 1800000,
  trackingOptions: {},
  flushIntervalMillis: 10000,
  flushMaxRetries: 5,
  flushQueueSize: 10,
  logLevel: LogLevel.Warn,
  loggerProvider: undefined as any,
  transportProvider: undefined as any,
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

describe('SessionReplayPlugin Integration', () => {
  let SessionReplayPlugin: typeof import('../src/plugin-session-replay').SessionReplayPlugin;
  let NativeModules: typeof import('react-native').NativeModules;

  beforeEach(() => {
    jest.resetModules();
    // Re-import after resetting modules to clear module-level state and reapply mocks
    SessionReplayPlugin = require('../src/plugin-session-replay').SessionReplayPlugin;
    NativeModules = require('react-native').NativeModules;
    jest.clearAllMocks();
  });

  it('should instantiate and setup with default config', async () => {
    const plugin = new SessionReplayPlugin();
    expect(plugin).toBeInstanceOf(SessionReplayPlugin);
    expect(plugin.name).toBe('@amplitude/plugin-session-replay-react-native');
    expect(plugin.type).toBe('enrichment');

    // Setup with default config
    await plugin.setup(minimalConfig, mockReactNativeClient);
    expect(NativeModules.AMPNativeSessionReplay.setup).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-api-key', serverZone: 'US' }),
    );
    const [defaultSetupConfig] = NativeModules.AMPNativeSessionReplay.setup.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(defaultSetupConfig)).not.toContain('autoStart');
    expect(NativeModules.AMPNativeSessionReplay.start).toHaveBeenCalledTimes(1);
  });

  it('should instantiate and setup with custom config', async () => {
    const config: SessionReplayPluginConfig = {
      sampleRate: 0.5,
      enableRemoteConfig: false,
      logLevel: LogLevel.Debug,
      autoStart: false,
    };
    const plugin = new SessionReplayPlugin(config);
    await plugin.setup({ ...minimalConfig, serverZone: 'EU' }, mockReactNativeClient);
    expect(NativeModules.AMPNativeSessionReplay.setup).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-api-key', serverZone: 'EU' }),
    );
    const [customSetupConfig] = NativeModules.AMPNativeSessionReplay.setup.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(customSetupConfig)).not.toContain('autoStart');
    expect(NativeModules.AMPNativeSessionReplay.start).not.toHaveBeenCalled();
  });

  it('should call start, stop, and teardown', async () => {
    const plugin = new SessionReplayPlugin();
    await plugin.setup(minimalConfig, mockReactNativeClient);
    await plugin.start();
    expect(NativeModules.AMPNativeSessionReplay.start).toHaveBeenCalled();
    await plugin.stop();
    expect(NativeModules.AMPNativeSessionReplay.stop).toHaveBeenCalled();
    await plugin.teardown();
    // teardown should call stop again (idempotent)
    expect(NativeModules.AMPNativeSessionReplay.stop).toHaveBeenCalledTimes(2);
  });

  it('should not stamp session replay properties on events', async () => {
    const plugin = new SessionReplayPlugin();
    await plugin.setup(minimalConfig, mockReactNativeClient);
    const event = { event_type: 'test_event', session_id: minimalConfig.sessionId, event_properties: {} };
    const enriched = await plugin.execute(event);
    expect(enriched).toEqual(event);
  });

  it('should not enrich event if not initialized', async () => {
    const plugin = new SessionReplayPlugin();
    const event = { event_type: 'test_event', event_properties: {} };
    const enriched = await plugin.execute(event);
    expect(enriched).toEqual(event);
    expect(NativeModules.AMPNativeSessionReplay.setup).not.toHaveBeenCalled();
  });
});
