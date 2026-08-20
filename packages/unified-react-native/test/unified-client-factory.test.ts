import type { ReactNativeClient } from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-core';
import { createInstance as createAnalyticsInstance } from '@amplitude/analytics-react-native';
import { getPlugin } from '@amplitude/plugin-engagement-react-native';
import { experimentPlugin } from '@amplitude/plugin-experiment-react-native';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';
import { createInstance } from '../src/unified-client-factory';

jest.mock('@amplitude/analytics-react-native', () => ({
  createInstance: jest.fn(),
}));

jest.mock('@amplitude/plugin-session-replay-react-native', () => ({
  SessionReplayPlugin: jest.fn().mockImplementation((config) => ({ name: 'session-replay', config })),
}));

jest.mock('@amplitude/plugin-engagement-react-native', () => ({
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
const mockGetPlugin = getPlugin as jest.MockedFunction<typeof getPlugin>;
const mockExperimentPlugin = experimentPlugin as jest.MockedFunction<typeof experimentPlugin>;
const MockSessionReplayPlugin = SessionReplayPlugin as jest.MockedClass<typeof SessionReplayPlugin>;

const returnValue = <T>(value?: T) => ({ promise: Promise.resolve(value) });

describe('createInstance', () => {
  const add = jest.fn(() => returnValue());
  const init = jest.fn(() => returnValue());
  const analyticsClient = { add, init } as unknown as ReactNativeClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAnalyticsInstance.mockReturnValue(analyticsClient);
  });

  test('initializes analytics, Experiment, Session Replay, and Guides and Surveys', async () => {
    const client = createInstance();

    expect(client.experiment()).toBeUndefined();
    expect(client.sessionReplay()).toBeUndefined();
    expect(client.engagement()).toBeUndefined();

    await client.initAll('api-key', {
      serverZone: 'EU',
      instanceName: 'app',
      logLevel: LogLevel.Debug,
      analytics: { userId: 'user-id' },
      sessionReplay: { sampleRate: 0.5 },
      experiment: { deploymentKey: 'deployment-key' },
      engagement: { locale: 'fr-FR' },
    });

    expect(init).toHaveBeenCalledWith(
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
    expect(mockGetPlugin).toHaveBeenCalledWith({ serverZone: 'EU', logLevel: 'debug', locale: 'fr-FR' });
    expect(add).toHaveBeenCalledTimes(4);
    expect(client.experiment()).toBeDefined();
    expect(client.sessionReplay()).toBeDefined();
    expect(client.engagement()).toBeDefined();
  });

  test('lets blade options override shared defaults', async () => {
    const client = createInstance();

    await client.initAll('api-key', {
      serverZone: 'US',
      instanceName: 'shared-instance',
      logLevel: LogLevel.Debug,
      analytics: { serverZone: 'EU', instanceName: 'analytics-instance', logLevel: LogLevel.Error },
      sessionReplay: { logLevel: LogLevel.Warn },
      experiment: { serverZone: 'EU', instanceName: 'experiment-instance' },
      engagement: { serverZone: 'EU', logLevel: 'verbose' },
    });

    expect(init).toHaveBeenCalledWith(
      'api-key',
      undefined,
      expect.objectContaining({ serverZone: 'EU', instanceName: 'analytics-instance', logLevel: LogLevel.Error }),
    );
    expect(mockExperimentPlugin).toHaveBeenCalledWith({ serverZone: 'EU', instanceName: 'experiment-instance' });
    expect(MockSessionReplayPlugin).toHaveBeenCalledWith({ logLevel: LogLevel.Warn });
    expect(mockGetPlugin).toHaveBeenCalledWith({ serverZone: 'EU', logLevel: 'verbose' });
  });

  test.each([
    [LogLevel.None, 'none'],
    [LogLevel.Error, 'error'],
    [LogLevel.Warn, 'warn'],
    [LogLevel.Verbose, 'verbose'],
    [LogLevel.Debug, 'debug'],
  ])('translates shared log level %s for Guides and Surveys', async (logLevel, engagementLogLevel) => {
    const client = createInstance();

    await client.initAll('api-key', { logLevel });

    expect(mockGetPlugin).toHaveBeenCalledWith({ logLevel: engagementLogLevel });
  });

  test('supports initialization without options', async () => {
    const client = createInstance();

    await client.initAll('api-key');

    expect(init).toHaveBeenCalledWith('api-key', undefined, {});
    expect(mockExperimentPlugin).toHaveBeenCalledWith({});
    expect(MockSessionReplayPlugin).toHaveBeenCalledWith({});
    expect(mockGetPlugin).toHaveBeenCalledWith({});
  });

  test('reuses blade instances on sequential initialization', async () => {
    const client = createInstance();

    await client.initAll('first-api-key');
    const sessionReplay = client.sessionReplay();
    const experiment = client.experiment();
    const engagement = client.engagement();
    await client.initAll('second-api-key');

    expect(init).toHaveBeenCalledTimes(2);
    expect(mockExperimentPlugin).toHaveBeenCalledTimes(1);
    expect(MockSessionReplayPlugin).toHaveBeenCalledTimes(1);
    expect(mockGetPlugin).toHaveBeenCalledTimes(1);
    expect(client.sessionReplay()).toBe(sessionReplay);
    expect(client.experiment()).toBe(experiment);
    expect(client.engagement()).toBe(engagement);
  });

  test('shares one initialization with concurrent callers', async () => {
    let finishInit: (() => void) | undefined;
    init.mockReturnValueOnce({
      promise: new Promise<void>((resolve) => {
        finishInit = resolve;
      }),
    });
    const client = createInstance();

    const first = client.initAll('api-key');
    const second = client.initAll('api-key');
    await Promise.resolve();

    expect(init).toHaveBeenCalledTimes(1);
    finishInit?.();
    await Promise.all([first, second]);
    expect(MockSessionReplayPlugin).toHaveBeenCalledTimes(1);
    expect(mockExperimentPlugin).toHaveBeenCalledTimes(1);
    expect(mockGetPlugin).toHaveBeenCalledTimes(1);
  });
});
