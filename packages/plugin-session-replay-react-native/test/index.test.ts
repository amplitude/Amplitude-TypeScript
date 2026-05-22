import { LogLevel } from '@amplitude/analytics-types';

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
  },
}));

import { getDefaultConfig, MaskLevel } from '../src/session-replay-config';
import { SessionReplayPlugin } from '../src/session-replay';

describe('Session Replay default config', () => {
  it('should have autostart default to true', () => {
    const config = getDefaultConfig();
    expect(config.autoStart).toBe(true);
  });

  it('should have maskLevel default to Medium', () => {
    const config = getDefaultConfig();
    expect(config.maskLevel).toBe(MaskLevel.Medium);
  });
});

describe('MaskLevel enum values', () => {
  it('exposes the three expected masking levels', () => {
    expect(MaskLevel.Light).toBe('light');
    expect(MaskLevel.Medium).toBe('medium');
    expect(MaskLevel.Conservative).toBe('conservative');
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
    const plugin = new SessionReplayPlugin({ maskLevel: MaskLevel.Conservative });
    await plugin.setup(baseConfig as never, {} as never);
    expect(nativeSetupMock).toHaveBeenCalledTimes(1);
    expect(setupArgs()[8]).toBe(MaskLevel.Conservative);
    expect(setupArgs()[8]).toBe('conservative');
  });

  it('forwards Light as the 9th positional argument', async () => {
    const plugin = new SessionReplayPlugin({ maskLevel: MaskLevel.Light });
    await plugin.setup(baseConfig as never, {} as never);
    expect(setupArgs()[8]).toBe(MaskLevel.Light);
    expect(setupArgs()[8]).toBe('light');
  });

  it('forwards Medium as the 9th positional argument', async () => {
    const plugin = new SessionReplayPlugin({ maskLevel: MaskLevel.Medium });
    await plugin.setup(baseConfig as never, {} as never);
    expect(setupArgs()[8]).toBe(MaskLevel.Medium);
    expect(setupArgs()[8]).toBe('medium');
  });

  it('defaults to Medium when maskLevel is not provided', async () => {
    const plugin = new SessionReplayPlugin();
    await plugin.setup(baseConfig as never, {} as never);
    expect(setupArgs()[8]).toBe(MaskLevel.Medium);
  });

  it('passes prior positional arguments through unchanged', async () => {
    const plugin = new SessionReplayPlugin({
      sampleRate: 0.5,
      enableRemoteConfig: false,
      logLevel: LogLevel.Debug,
      autoStart: false,
      maskLevel: MaskLevel.Conservative,
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
    expect(args[8]).toBe(MaskLevel.Conservative);
  });
});
