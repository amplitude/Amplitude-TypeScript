import { LogLevel } from '@amplitude/analytics-core';
import { DeviceEventEmitter } from 'react-native';

const nativeSetupMock = jest.fn((..._args: unknown[]) => Promise.resolve());

jest.mock('../src/native-module', () => ({
  PluginSessionReplayReactNative: {
    setup: nativeSetupMock,
    setSessionId: jest.fn(() => Promise.resolve()),
    getSessionId: jest.fn(() => Promise.resolve(0)),
    getSessionReplayProperties: jest.fn(() => Promise.resolve({})),
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    teardown: jest.fn(() => Promise.resolve()),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

import { getDefaultConfig } from '../src/session-replay-config';
import { SessionReplayPlugin, addUiChangeListener } from '../src/session-replay';

describe('UI change listeners', () => {
  it('delivers repeated native changes and unsubscribes listeners independently', () => {
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribeFirst = addUiChangeListener(first);
    const unsubscribeSecond = addUiChangeListener(second);

    DeviceEventEmitter.emit('amplitudeSessionReplayUiChange');
    DeviceEventEmitter.emit('amplitudeSessionReplayUiChange');
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeFirst();
    unsubscribeFirst();
    DeviceEventEmitter.emit('amplitudeSessionReplayUiChange');
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(3);
    unsubscribeSecond();
    DeviceEventEmitter.emit('amplitudeSessionReplayUiChange');
    expect(second).toHaveBeenCalledTimes(3);
  });

  it('allows independent registrations of the same callback and resubscribing after cleanup', () => {
    const listener = jest.fn();
    const unsubscribeFirst = addUiChangeListener(listener);
    const unsubscribeSecond = addUiChangeListener(listener);
    unsubscribeFirst();
    DeviceEventEmitter.emit('amplitudeSessionReplayUiChange');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribeSecond();

    const unsubscribeThird = addUiChangeListener(listener);
    unsubscribeFirst();
    DeviceEventEmitter.emit('amplitudeSessionReplayUiChange');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribeThird();
  });
});

describe('Session Replay default config', () => {
  it('should have autostart default to true', () => {
    const config = getDefaultConfig();
    expect(config.autoStart).toBe(true);
  });

  it('should not bake a maskLevel into privacyConfig (resolved at the native boundary)', () => {
    const config = getDefaultConfig();
    expect(config.privacyConfig?.maskLevel).toBeUndefined();
  });
});

describe('SessionReplayPlugin.setup forwards maskLevel to native', () => {
  const baseConfig = {
    apiKey: 'test-api-key',
    deviceId: 'test-device',
    sessionId: 12345,
    serverZone: 'US' as const,
  };

  beforeEach(() => {
    nativeSetupMock.mockClear();
  });

  const setupArgs = () => nativeSetupMock.mock.calls[0];

  it('forwards Conservative as the 9th positional argument', async () => {
    const plugin = new SessionReplayPlugin({ privacyConfig: { maskLevel: 'conservative' } });
    await plugin.setup(baseConfig as never, {} as never);
    expect(nativeSetupMock).toHaveBeenCalledTimes(1);
    expect(setupArgs()[8]).toBe('conservative');
    expect(setupArgs()[8]).toBe('conservative');
  });

  it('forwards Light as the 9th positional argument', async () => {
    const plugin = new SessionReplayPlugin({ privacyConfig: { maskLevel: 'light' } });
    await plugin.setup(baseConfig as never, {} as never);
    expect(setupArgs()[8]).toBe('light');
    expect(setupArgs()[8]).toBe('light');
  });

  it('forwards Medium as the 9th positional argument', async () => {
    const plugin = new SessionReplayPlugin({ privacyConfig: { maskLevel: 'medium' } });
    await plugin.setup(baseConfig as never, {} as never);
    expect(setupArgs()[8]).toBe('medium');
    expect(setupArgs()[8]).toBe('medium');
  });

  it('defaults to Medium when maskLevel is not provided', async () => {
    const plugin = new SessionReplayPlugin();
    await plugin.setup(baseConfig as never, {} as never);
    expect(setupArgs()[8]).toBe('medium');
  });

  it('defaults to medium when privacyConfig is provided without a maskLevel', async () => {
    const plugin = new SessionReplayPlugin({ privacyConfig: {} });
    await plugin.setup(baseConfig as never, {} as never);
    expect(setupArgs()[8]).toBe('medium');
  });

  it('passes prior positional arguments through unchanged', async () => {
    const plugin = new SessionReplayPlugin({
      sampleRate: 0.5,
      enableRemoteConfig: false,
      logLevel: LogLevel.Debug,
      autoStart: false,
      privacyConfig: { maskLevel: 'conservative' },
    });
    await plugin.setup(baseConfig as never, {} as never);
    const args = setupArgs();
    expect(args[0]).toBe('test-api-key');
    expect(args[1]).toBe('test-device');
    expect(args[2]).toBe(12345);
    expect(args[3]).toBe('US');
    expect(args[4]).toBe(0.5);
    expect(args[5]).toBe(false);
    expect(args[6]).toBe(LogLevel.Debug);
    expect(args[7]).toBe(false);
    expect(args[8]).toBe('conservative');
  });
});
