import { LogLevel } from '@amplitude/analytics-core';

const nativeSetupMock = jest.fn((..._args: unknown[]) => Promise.resolve());
const nativeSetDeviceIdMock = jest.fn((..._args: unknown[]) => Promise.resolve());
const nativeGetDeviceIdMock = jest.fn(() => Promise.resolve('test-device'));

jest.mock('../src/native-module', () => ({
  PluginSessionReplayReactNative: {
    setup: nativeSetupMock,
    setSessionId: jest.fn(() => Promise.resolve()),
    getSessionId: jest.fn(() => Promise.resolve(0)),
    setDeviceId: nativeSetDeviceIdMock,
    getDeviceId: nativeGetDeviceIdMock,
    getSessionReplayProperties: jest.fn(() => Promise.resolve({})),
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    teardown: jest.fn(() => Promise.resolve()),
  },
}));

import { getDefaultConfig } from '../src/session-replay-config';
import { PluginSessionReplayReactNative } from '../src/native-module';
import { SessionReplayPlugin } from '../src/session-replay';

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

describe('SessionReplayPlugin.execute identity sync', () => {
  const baseConfig = {
    apiKey: 'test-api-key',
    deviceId: 'test-device',
    sessionId: 12345,
    serverZone: 'US' as const,
  };
  const event = { event_type: 'click', session_id: 12345, event_properties: {} };

  beforeEach(() => {
    nativeSetDeviceIdMock.mockClear();
    nativeGetDeviceIdMock.mockReset();
    nativeGetDeviceIdMock.mockResolvedValue('test-device');
  });

  it('pushes a changed analytics device id into Session Replay once', async () => {
    let replayDeviceId = 'test-device';
    nativeGetDeviceIdMock.mockImplementation(() => Promise.resolve(replayDeviceId));
    nativeSetDeviceIdMock.mockImplementation((...args: unknown[]) => {
      replayDeviceId = String(args[0]);
      return Promise.resolve();
    });

    const plugin = new SessionReplayPlugin();
    const config = { ...baseConfig };
    await plugin.setup(config as never, {} as never);

    await plugin.execute(event as never);
    expect(nativeSetDeviceIdMock).not.toHaveBeenCalled();

    config.deviceId = 'device-after-reset';
    await plugin.execute(event as never);
    expect(nativeSetDeviceIdMock).toHaveBeenCalledTimes(1);
    expect(nativeSetDeviceIdMock).toHaveBeenCalledWith('device-after-reset');

    await plugin.execute(event as never);
    expect(nativeSetDeviceIdMock).toHaveBeenCalledTimes(1);
  });

  it('still enriches the event when the native build cannot sync device id', async () => {
    const native = PluginSessionReplayReactNative as {
      getDeviceId?: unknown;
      setDeviceId?: unknown;
    };
    const originalGet = native.getDeviceId;
    const originalSet = native.setDeviceId;
    native.getDeviceId = undefined;
    native.setDeviceId = undefined;
    try {
      const plugin = new SessionReplayPlugin();
      const config = { ...baseConfig, deviceId: 'stale-device' };
      await plugin.setup(config as never, {} as never);
      config.deviceId = 'device-after-reset';
      await expect(plugin.execute(event as never)).resolves.toMatchObject({ event_type: 'click' });
    } finally {
      native.getDeviceId = originalGet;
      native.setDeviceId = originalSet;
    }
  });
});
