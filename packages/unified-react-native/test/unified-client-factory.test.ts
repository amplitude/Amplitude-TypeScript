import type { ReactNativeClient } from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-core';
import { createInstance as createAnalyticsInstance } from '@amplitude/analytics-react-native';
import { boot, getPlugin } from '@amplitude/plugin-engagement-react-native';
import { experimentPlugin } from '@amplitude/plugin-experiment-react-native';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';
import { createInstance } from '../src/unified-client-factory';

jest.mock('@amplitude/analytics-react-native', () => ({
  createInstance: jest.fn(),
}));

jest.mock('@amplitude/plugin-session-replay-react-native', () => ({
  SessionReplayPlugin: jest.fn().mockImplementation((config) => ({
    name: 'session-replay',
    config,
    sessionReplayConfig: { autoStart: config?.autoStart ?? true },
    start: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('@amplitude/plugin-engagement-react-native', () => ({
  boot: jest.fn(() => Promise.resolve()),
  getPlugin: jest.fn().mockImplementation((config) => ({ name: 'engagement', config })),
}));

jest.mock('@amplitude/plugin-experiment-react-native', () => ({
  experimentPlugin: jest.fn().mockImplementation((config) => ({
    name: 'experiment',
    config,
    experiment: { start: jest.fn(), variant: jest.fn() },
  })),
}));

const mockCreateAnalyticsInstance = createAnalyticsInstance as jest.MockedFunction<typeof createAnalyticsInstance>;
const mockBoot = boot as jest.MockedFunction<typeof boot>;
const mockGetPlugin = getPlugin as jest.MockedFunction<typeof getPlugin>;
const mockExperimentPlugin = experimentPlugin as jest.MockedFunction<typeof experimentPlugin>;
const MockSessionReplayPlugin = SessionReplayPlugin as jest.MockedClass<typeof SessionReplayPlugin>;

const returnValue = <T>(value?: T) => ({ promise: Promise.resolve(value) });

describe('createInstance', () => {
  const add = jest.fn(() => returnValue());
  const analyticsInit = jest.fn(() => returnValue());
  const analyticsClient = {
    add,
    init: analyticsInit,
    getUserId: jest.fn(() => 'user-id'),
    getDeviceId: jest.fn(() => 'device-id'),
  } as unknown as ReactNativeClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAnalyticsInstance.mockReturnValue(analyticsClient);
  });

  test('initializes analytics, Experiment, Session Replay, and Guides and Surveys', async () => {
    const client = createInstance();

    expect(client.experiment()).toBeUndefined();
    expect(client.sessionReplay()).toBeUndefined();
    expect(client.engagement()).toBeUndefined();

    await client.init('api-key', {
      serverZone: 'EU',
      instanceName: 'app',
      logLevel: LogLevel.Debug,
      analytics: { userId: 'user-id' },
      sessionReplay: { sampleRate: 0.5 },
      experiment: { deploymentKey: 'deployment-key' },
      engagement: { locale: 'fr-FR' },
    });

    expect(analyticsInit).toHaveBeenCalledWith(
      'api-key',
      'user-id',
      expect.objectContaining({
        serverZone: 'EU',
        instanceName: 'app',
        logLevel: LogLevel.Debug,
        userId: 'user-id',
      }),
    );
    expect(mockExperimentPlugin).toHaveBeenCalledWith({
      serverZone: 'EU',
      instanceName: 'app',
      deploymentKey: 'deployment-key',
    });
    expect(MockSessionReplayPlugin).toHaveBeenCalledWith({ logLevel: LogLevel.Debug, sampleRate: 0.5 });
    const sessionReplayStart = (client.sessionReplay() as unknown as { start: jest.Mock }).start;
    expect(sessionReplayStart).not.toHaveBeenCalled();
    expect(mockGetPlugin).toHaveBeenCalledWith({ serverZone: 'EU', logLevel: 'debug', locale: 'fr-FR' });
    expect(mockBoot).toHaveBeenCalledWith('user-id', 'device-id');
    const experimentStart = (client.experiment() as unknown as { start: jest.Mock }).start;
    expect(experimentStart).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(4);
    expect(client.experiment()).toBeDefined();
    expect(client.sessionReplay()).toBeDefined();
    expect(client.engagement()).toBeDefined();
  });

  test('lets blade options override shared defaults', async () => {
    const client = createInstance();

    await client.init('api-key', {
      serverZone: 'US',
      instanceName: 'shared-instance',
      logLevel: LogLevel.Debug,
      analytics: { serverZone: 'EU', instanceName: 'analytics-instance', logLevel: LogLevel.Error },
      sessionReplay: { logLevel: LogLevel.Warn },
      experiment: { serverZone: 'EU', instanceName: 'experiment-instance' },
      engagement: { serverZone: 'EU', logLevel: 'verbose' },
    });

    expect(analyticsInit).toHaveBeenCalledWith(
      'api-key',
      undefined,
      expect.objectContaining({ serverZone: 'EU', instanceName: 'analytics-instance', logLevel: LogLevel.Error }),
    );
    expect(mockExperimentPlugin).toHaveBeenCalledWith({ serverZone: 'EU', instanceName: 'experiment-instance' });
    expect(MockSessionReplayPlugin).toHaveBeenCalledWith({ logLevel: LogLevel.Warn });
    expect(mockGetPlugin).toHaveBeenCalledWith({ serverZone: 'EU', logLevel: 'verbose' });
  });

  test('logs when the Experiment plugin does not expose a client', async () => {
    mockExperimentPlugin.mockReturnValueOnce({ name: 'experiment' } as ReturnType<typeof experimentPlugin>);
    const loggerProvider = {
      debug: jest.fn(),
      disable: jest.fn(),
      enable: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    };
    const client = createInstance();

    await client.init('api-key', { analytics: { loggerProvider } });

    expect(loggerProvider.debug).toHaveBeenCalledWith('experiment plugin is not initialized.');
    expect(client.experiment()).toBeUndefined();
  });

  test.each([
    [LogLevel.None, 'none'],
    [LogLevel.Error, 'error'],
    [LogLevel.Warn, 'warn'],
    [LogLevel.Verbose, 'verbose'],
    [LogLevel.Debug, 'debug'],
  ])('translates shared log level %s for Guides and Surveys', async (logLevel, engagementLogLevel) => {
    const client = createInstance();

    await client.init('api-key', { logLevel });

    expect(mockGetPlugin).toHaveBeenCalledWith({ logLevel: engagementLogLevel });
  });

  test('supports initialization without options', async () => {
    const client = createInstance();

    await client.init('api-key');

    expect(analyticsInit).toHaveBeenCalledWith(
      'api-key',
      undefined,
      expect.objectContaining({ loggerProvider: expect.anything() }),
    );
    expect(mockExperimentPlugin).toHaveBeenCalledWith({});
    expect(MockSessionReplayPlugin).toHaveBeenCalledWith({});
    expect(mockGetPlugin).toHaveBeenCalledWith({});
  });

  test('does not reinitialize SDKs on sequential initialization', async () => {
    const client = createInstance();

    await client.init('first-api-key');
    const sessionReplay = client.sessionReplay();
    const experiment = client.experiment();
    const engagement = client.engagement();
    await client.init('second-api-key', { sessionReplay: { sampleRate: 0 } });

    expect(analyticsInit).toHaveBeenCalledTimes(1);
    expect(mockExperimentPlugin).toHaveBeenCalledTimes(1);
    expect(MockSessionReplayPlugin).toHaveBeenCalledTimes(1);
    expect(MockSessionReplayPlugin).toHaveBeenCalledWith({});
    expect(mockGetPlugin).toHaveBeenCalledTimes(1);
    expect(client.sessionReplay()).toBe(sessionReplay);
    expect(client.experiment()).toBe(experiment);
    expect(client.engagement()).toBe(engagement);
  });

  test('shares one initialization with concurrent callers', async () => {
    let finishInit: (() => void) | undefined;
    analyticsInit.mockReturnValueOnce({
      promise: new Promise<void>((resolve) => {
        finishInit = resolve;
      }),
    });
    const client = createInstance();

    const first = client.init('api-key');
    const second = client.init('api-key');
    await Promise.resolve();

    expect(analyticsInit).toHaveBeenCalledTimes(1);
    finishInit?.();
    await Promise.all([first, second]);
    expect(MockSessionReplayPlugin).toHaveBeenCalledTimes(1);
    expect(mockExperimentPlugin).toHaveBeenCalledTimes(1);
    expect(mockGetPlugin).toHaveBeenCalledTimes(1);
  });
});
