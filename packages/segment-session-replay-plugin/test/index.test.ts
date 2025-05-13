import { Analytics, Context, Plugin, AnalyticsBrowser } from '@segment/analytics-next';
import { createSegmentActionsPlugin } from '../src';
import { VERSION } from '../src/version';
import * as sessionReplay from '@amplitude/session-replay-browser';
import { getSessionId, updateSessionIdAndAddProperties, setSessionId } from '../src/helpers';

jest.mock('@amplitude/session-replay-browser');
jest.mock('js-cookie');
jest.mock('../src/helpers');

describe('createSegmentActionsPlugin()', () => {
  const API_KEY = 'test-api-key';
  const ANONYMOUS_ID = 'test-anonymous-id';
  const DEVICE_ID = 'test-device-id';
  const SESSION_ID = 'test-session-id';
  const DEFAULT_SESSION_REPLAY_OPTIONS = {
    sampleRate: 1,
  };

  const DEFAULT_CONTEXT: Context = {
    event: {
      properties: {},
      integrations: {},
    },
    updateEvent: jest.fn(),
  } as unknown as Context;

  const DEFAULT_ANALYTICS: Analytics = {
    user: jest.fn().mockReturnValue({
      anonymousId: jest.fn().mockReturnValue(ANONYMOUS_ID),
    }),
  } as unknown as Analytics;

  const DEFAULT_SEGMENT_INSTANCE: AnalyticsBrowser = {
    register: jest.fn(),
  } as unknown as AnalyticsBrowser;

  const getPlugin = (mockSegmentInstance: AnalyticsBrowser): Plugin => {
    if (!mockSegmentInstance.register || !(mockSegmentInstance.register as jest.Mock).mock.calls[0]) {
      throw new Error('Segment instance is not properly initialized');
    }
    const calls = (mockSegmentInstance.register as jest.Mock).mock.calls as Array<[Plugin]>;
    return calls[0][0];
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (sessionReplay.init as jest.Mock).mockResolvedValue({ promise: Promise.resolve() });
  });

  it('should call segmentInstance.register() with the plugin', async () => {
    // Arrange & Act
    await createSegmentActionsPlugin({
      segmentInstance: DEFAULT_SEGMENT_INSTANCE,
      amplitudeApiKey: API_KEY,
    });

    // Assert
    expect(DEFAULT_SEGMENT_INSTANCE.register).toHaveBeenCalledWith({
      name: 'Session Replay Events',
      type: 'enrichment',
      version: VERSION,
      isLoaded: expect.any(Function) as unknown as () => boolean,
      load: expect.any(Function) as unknown as (ctx: Context, ajs: Analytics) => Promise<void>,
      track: expect.any(Function) as unknown as (ctx: Context) => Promise<Context>,
      page: expect.any(Function) as unknown as (ctx: Context) => Promise<Context>,
      identify: expect.any(Function) as unknown as (ctx: Context) => Promise<Context>,
    });
  });

  describe('load()', () => {
    it('should call sessionReplay.init() with the correct parameters', async () => {
      // Arrange
      (getSessionId as jest.Mock).mockReturnValue(SESSION_ID);
      await createSegmentActionsPlugin({
        segmentInstance: DEFAULT_SEGMENT_INSTANCE,
        amplitudeApiKey: API_KEY,
        sessionReplayOptions: DEFAULT_SESSION_REPLAY_OPTIONS,
      });

      const plugin = getPlugin(DEFAULT_SEGMENT_INSTANCE);

      // Act
      await plugin.load(DEFAULT_CONTEXT, DEFAULT_ANALYTICS);

      // Assert
      expect(sessionReplay.init).toHaveBeenCalledWith(API_KEY, {
        ...DEFAULT_SESSION_REPLAY_OPTIONS,
        sessionId: SESSION_ID,
        deviceId: ANONYMOUS_ID,
        version: {
          type: 'segment',
          version: VERSION,
        },
      });
    });

    it('should call init() with the provided deviceId', async () => {
      // Arrange
      const sessionReplayOptions = {
        ...DEFAULT_SESSION_REPLAY_OPTIONS,
        deviceId: DEVICE_ID,
      };

      await createSegmentActionsPlugin({
        segmentInstance: DEFAULT_SEGMENT_INSTANCE,
        amplitudeApiKey: API_KEY,
        sessionReplayOptions,
      });

      const plugin = getPlugin(DEFAULT_SEGMENT_INSTANCE);

      // Act
      await plugin.load(DEFAULT_CONTEXT, DEFAULT_ANALYTICS);

      // Assert
      expect(sessionReplay.init).toHaveBeenCalledWith(API_KEY, {
        ...DEFAULT_SESSION_REPLAY_OPTIONS,
        sessionId: SESSION_ID,
        deviceId: DEVICE_ID,
        version: {
          type: 'segment',
          version: VERSION,
        },
      });
    });

    it('should call init() with the anonymousId if no deviceId is provided', async () => {
      await createSegmentActionsPlugin({
        segmentInstance: DEFAULT_SEGMENT_INSTANCE,
        amplitudeApiKey: API_KEY,
        sessionReplayOptions: DEFAULT_SESSION_REPLAY_OPTIONS,
      });

      const plugin = getPlugin(DEFAULT_SEGMENT_INSTANCE);
      await plugin.load(DEFAULT_CONTEXT, DEFAULT_ANALYTICS);

      // Assert
      expect(sessionReplay.init).toHaveBeenCalledWith(API_KEY, {
        ...DEFAULT_SESSION_REPLAY_OPTIONS,
        sessionId: SESSION_ID,
        deviceId: ANONYMOUS_ID,
        version: {
          type: 'segment',
          version: VERSION,
        },
      });
    });

    it.each([123, undefined])('should call init() with the sessionId', async (sessionId) => {
      // Arrange
      (getSessionId as jest.Mock).mockReturnValue(sessionId);

      await createSegmentActionsPlugin({
        segmentInstance: DEFAULT_SEGMENT_INSTANCE,
        amplitudeApiKey: API_KEY,
        sessionReplayOptions: DEFAULT_SESSION_REPLAY_OPTIONS,
      });

      const plugin = getPlugin(DEFAULT_SEGMENT_INSTANCE);

      // Act
      await plugin.load(DEFAULT_CONTEXT, DEFAULT_ANALYTICS);

      // Assert
      expect(sessionReplay.init).toHaveBeenCalledWith(API_KEY, {
        ...DEFAULT_SESSION_REPLAY_OPTIONS,
        sessionId,
        deviceId: ANONYMOUS_ID,
        version: {
          type: 'segment',
          version: VERSION,
        },
      });
    });
  });

  describe('track()', () => {
    it.each([
      {
        description: 'with the provided deviceId',
        providedDeviceId: 'provided-device-id',
        expectedDeviceId: 'provided-device-id',
      },
      {
        description: 'with the anonymousId if deviceId is not provided',
        providedDeviceId: undefined,
        expectedDeviceId: ANONYMOUS_ID,
      },
    ])(
      'should call updateSessionIdAndAddProperties() with the context and $description',
      async ({ providedDeviceId, expectedDeviceId }) => {
        // Arrange
        (updateSessionIdAndAddProperties as jest.Mock).mockResolvedValue(null);

        await createSegmentActionsPlugin({
          segmentInstance: DEFAULT_SEGMENT_INSTANCE,
          amplitudeApiKey: API_KEY,
          sessionReplayOptions: {
            ...DEFAULT_SESSION_REPLAY_OPTIONS,
            deviceId: providedDeviceId,
          },
        });

        const plugin = getPlugin(DEFAULT_SEGMENT_INSTANCE);

        // NOTE: load() must be called before track()
        await plugin.load(DEFAULT_CONTEXT, DEFAULT_ANALYTICS);

        // Act
        plugin.track && (await plugin.track(DEFAULT_CONTEXT));

        // Assert
        expect(updateSessionIdAndAddProperties).toHaveBeenCalledWith(DEFAULT_CONTEXT, expectedDeviceId);
      },
    );
  });

  describe('page()', () => {
    it.each([
      {
        description: 'with the provided deviceId',
        providedDeviceId: 'provided-device-id',
        expectedDeviceId: 'provided-device-id',
      },
      {
        description: 'with the anonymousId if deviceId is not provided',
        providedDeviceId: undefined,
        expectedDeviceId: ANONYMOUS_ID,
      },
    ])(
      'should call updateSessionIdAndAddProperties() with the context and $description',
      async ({ providedDeviceId, expectedDeviceId }) => {
        // Arrange
        (updateSessionIdAndAddProperties as jest.Mock).mockResolvedValue(null);

        await createSegmentActionsPlugin({
          segmentInstance: DEFAULT_SEGMENT_INSTANCE,
          amplitudeApiKey: API_KEY,
          sessionReplayOptions: {
            ...DEFAULT_SESSION_REPLAY_OPTIONS,
            deviceId: providedDeviceId,
          },
        });

        const plugin = getPlugin(DEFAULT_SEGMENT_INSTANCE);

        // NOTE: load() must be called before page()
        await plugin.load(DEFAULT_CONTEXT, DEFAULT_ANALYTICS);

        // Act
        plugin.page && (await plugin.page(DEFAULT_CONTEXT));

        // Assert
        expect(updateSessionIdAndAddProperties).toHaveBeenCalledWith(DEFAULT_CONTEXT, expectedDeviceId);
      },
    );
  });

  describe('identify()', () => {
    it.each([
      {
        description: 'with a valid session ID and provided deviceId',
        sessionId: 'test-session-id',
        deviceId: 'provided-device-id',
        expectedDeviceId: 'provided-device-id',
      },
      {
        description: 'with a valid session ID and anonymousId as deviceId',
        sessionId: 'test-session-id',
        deviceId: undefined,
        expectedDeviceId: ANONYMOUS_ID,
      },
    ])('should call setSessionId() $description', async ({ sessionId, deviceId, expectedDeviceId }) => {
      // Arrange
      (getSessionId as jest.Mock).mockReturnValue(sessionId);

      await createSegmentActionsPlugin({
        segmentInstance: DEFAULT_SEGMENT_INSTANCE,
        amplitudeApiKey: API_KEY,
        sessionReplayOptions: {
          ...DEFAULT_SESSION_REPLAY_OPTIONS,
          deviceId,
        },
      });

      const plugin = getPlugin(DEFAULT_SEGMENT_INSTANCE);

      // NOTE: load() must be called before identify()
      await plugin.load(DEFAULT_CONTEXT, DEFAULT_ANALYTICS);

      // Act
      plugin.identify && (await plugin.identify(DEFAULT_CONTEXT));

      // Assert
      expect(setSessionId).toHaveBeenCalledWith(sessionId, expectedDeviceId);
    });

    it('should not call setSessionId() when getSessionId() returns undefined', async () => {
      // Arrange
      (getSessionId as jest.Mock).mockReturnValue(undefined);

      await createSegmentActionsPlugin({
        segmentInstance: DEFAULT_SEGMENT_INSTANCE,
        amplitudeApiKey: API_KEY,
        sessionReplayOptions: {
          ...DEFAULT_SESSION_REPLAY_OPTIONS,
          deviceId: DEVICE_ID,
        },
      });

      const plugin = getPlugin(DEFAULT_SEGMENT_INSTANCE);

      // NOTE: load() must be called before identify()
      await plugin.load(DEFAULT_CONTEXT, DEFAULT_ANALYTICS);

      // Act
      plugin.identify && (await plugin.identify(DEFAULT_CONTEXT));

      // Assert
      expect(setSessionId).not.toHaveBeenCalled();
    });
  });
});
