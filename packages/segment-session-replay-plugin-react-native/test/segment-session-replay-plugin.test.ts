// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

// Mock @segment/analytics-react-native to prevent native module initialization
jest.mock('@segment/analytics-react-native', () => ({
  PluginType: {
    enrichment: 'enrichment',
    destination: 'destination',
    utility: 'utility',
    before: 'before',
    after: 'after',
  },
  EventType: {
    TrackEvent: 'track',
    ScreenEvent: 'screen',
    IdentifyEvent: 'identify',
    GroupEvent: 'group',
    AliasEvent: 'alias',
  },
  Plugin: class Plugin {
    analytics: unknown;
    configure(analytics: unknown) {
      this.analytics = analytics;
    }
  },
}));

import { PluginType, EventType, SegmentEvent, SegmentClient } from '@segment/analytics-react-native';
import { SegmentSessionReplayPlugin, createSegmentSessionReplayPlugin } from '../src/segment-session-replay-plugin';
import {
  init,
  setDeviceId,
  setSessionId,
  getSessionId,
  getSessionReplayProperties,
  start,
  stop,
} from '@amplitude/session-replay-react-native';
import { VERSION } from '../src/version';

// Mock the session replay module
jest.mock('@amplitude/session-replay-react-native', () => ({
  init: jest.fn(),
  setDeviceId: jest.fn(),
  setSessionId: jest.fn(),
  getSessionId: jest.fn(),
  getSessionReplayProperties: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
}));

describe('SegmentSessionReplayPlugin', () => {
  let plugin: SegmentSessionReplayPlugin;
  let mockAnalytics: jest.Mocked<SegmentClient>;
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: native SDK has not yet received a real session ID (the -1 sentinel).
    (getSessionId as jest.Mock).mockResolvedValue(-1);

    mockConfig = {
      apiKey: 'test-api-key',
    };

    mockAnalytics = {
      track: jest.fn(),
      identify: jest.fn(),
      screen: jest.fn(),
      group: jest.fn(),
      alias: jest.fn(),
      reset: jest.fn(),
      flush: jest.fn(),
      userInfo: {
        get: jest.fn().mockReturnValue({ anonymousId: 'test-anonymous-id' }),
      },
    } as any;

    plugin = new SegmentSessionReplayPlugin(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(plugin.name).toBe('amplitude-segment-session-replay-plugin-react-native');
      expect(plugin.version).toBe(VERSION);
      expect(plugin.type).toBe(PluginType.enrichment);
    });
  });

  describe('configure', () => {
    it('should call super.configure and init with config', async () => {
      await plugin.configure(mockAnalytics);

      expect(init).toHaveBeenCalledWith({ ...mockConfig, deviceId: 'test-anonymous-id' });
    });
  });

  describe('execute', () => {
    it('should set session ID and device ID for track events', async () => {
      const mockEvent = {
        type: EventType.TrackEvent,
        event: 'test_event',
        properties: { session_id: '123' },
        context: {
          device: { id: 'device-123' },
        },
      } as SegmentEvent;

      const mockProperties = { replay_session_id: 'replay-123' };
      (getSessionReplayProperties as jest.Mock).mockResolvedValue(mockProperties);

      const result = await plugin.execute(mockEvent);

      expect(setSessionId).toHaveBeenCalledWith(123);
      expect(setDeviceId).toHaveBeenCalledWith('device-123');
      expect(getSessionReplayProperties).toHaveBeenCalled();
      expect((result as any).properties).toEqual({
        session_id: '123',
        replay_session_id: 'replay-123',
      });
    });

    it('should set session ID and device ID for screen events', async () => {
      const mockEvent = {
        type: EventType.ScreenEvent,
        name: 'test_screen',
        properties: { session_id: '456' },
        context: {
          device: { id: 'device-456' },
        },
      } as SegmentEvent;

      const mockProperties = { replay_session_id: 'replay-456' };
      (getSessionReplayProperties as jest.Mock).mockResolvedValue(mockProperties);

      const result = await plugin.execute(mockEvent);

      expect(setSessionId).toHaveBeenCalledWith(456);
      expect(setDeviceId).toHaveBeenCalledWith('device-456');
      expect(getSessionReplayProperties).toHaveBeenCalled();
      expect((result as any).properties).toEqual({
        session_id: '456',
        replay_session_id: 'replay-456',
      });
    });

    it('should use anonymousId when device.id is not available', async () => {
      const mockEvent: SegmentEvent = {
        type: EventType.TrackEvent,
        event: 'test_event',
        properties: {},
        context: {},
        anonymousId: 'anon-123',
      } as any;

      await plugin.execute(mockEvent);

      expect(setDeviceId).toHaveBeenCalledWith('anon-123');
    });

    it('should use -1 for session ID when not available', async () => {
      const mockEvent: SegmentEvent = {
        type: EventType.TrackEvent,
        event: 'test_event',
        properties: {},
        context: {
          device: { id: 'device-123' },
        },
      } as any;

      await plugin.execute(mockEvent);

      expect(setSessionId).toHaveBeenCalledWith(-1);
    });

    it('should extract session ID from Amplitude integration', async () => {
      const mockEvent: SegmentEvent = {
        type: EventType.TrackEvent,
        event: 'test_event',
        properties: {},
        context: {
          device: { id: 'device-123' },
        },
        integrations: {
          'Actions Amplitude': {
            session_id: 789,
          },
        },
      } as any;

      await plugin.execute(mockEvent);

      expect(setSessionId).toHaveBeenCalledWith(789);
    });

    it('should not call getSessionReplayProperties for non-track/screen events', async () => {
      const mockEvent: SegmentEvent = {
        type: EventType.IdentifyEvent,
        userId: 'user-123',
        traits: {},
      } as any;

      await plugin.execute(mockEvent);

      expect(getSessionReplayProperties).not.toHaveBeenCalled();
    });

    it('should handle null device ID gracefully', async () => {
      const mockEvent: SegmentEvent = {
        type: EventType.TrackEvent,
        event: 'test_event',
        properties: {},
        context: {},
      } as any;

      await plugin.execute(mockEvent);

      expect(setDeviceId).toHaveBeenCalledWith(null);
    });

    it('should handle invalid session_id string gracefully', async () => {
      const mockEvent: SegmentEvent = {
        type: EventType.TrackEvent,
        event: 'test_event',
        properties: { session_id: 'invalid-number' },
        context: {
          device: { id: 'device-123' },
        },
      } as any;

      await plugin.execute(mockEvent);

      expect(setSessionId).toHaveBeenCalledWith(-1);
    });

    it('should preserve existing properties when adding session replay properties', async () => {
      const mockEvent = {
        type: EventType.TrackEvent,
        event: 'test_event',
        properties: {
          existing_prop: 'value',
          session_id: '123',
        },
        context: {
          device: { id: 'device-123' },
        },
      } as SegmentEvent;

      const mockProperties = { replay_session_id: 'replay-123' };
      (getSessionReplayProperties as jest.Mock).mockResolvedValue(mockProperties);

      const result = await plugin.execute(mockEvent);

      expect((result as any).properties).toEqual({
        existing_prop: 'value',
        session_id: '123',
        replay_session_id: 'replay-123',
      });
    });
  });

  describe('shutdown', () => {
    it('should call stop', async () => {
      await plugin.shutdown();
      expect(stop).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should call native start immediately when a valid session ID already exists', async () => {
      (getSessionId as jest.Mock).mockResolvedValue(1700000000000);

      await plugin.start();

      expect(start).toHaveBeenCalledTimes(1);
    });

    it('should NOT call native start when session ID is -1 (autoStart:false bug)', async () => {
      // SR SDK still has the default -1 sentinel — no real session ID yet.
      (getSessionId as jest.Mock).mockResolvedValue(-1);

      await plugin.start();

      expect(start).not.toHaveBeenCalled();
    });

    it('should NOT call native start when session ID is null', async () => {
      (getSessionId as jest.Mock).mockResolvedValue(null);

      await plugin.start();

      expect(start).not.toHaveBeenCalled();
    });

    it('should flush deferred start on the first execute() with a valid session ID', async () => {
      // Simulate autoStart:false → start() before any event
      (getSessionId as jest.Mock).mockResolvedValue(-1);
      await plugin.start();
      expect(start).not.toHaveBeenCalled();

      // First real event arrives carrying the actual session ID
      const mockEvent: SegmentEvent = {
        type: EventType.TrackEvent,
        event: 'app_opened',
        properties: { session_id: '1700000000000' },
        context: { device: { id: 'device-abc' } },
      } as any;
      (getSessionReplayProperties as jest.Mock).mockResolvedValue({});

      await plugin.execute(mockEvent);

      // Native start() should now have been called exactly once with the real id.
      expect(start).toHaveBeenCalledTimes(1);
    });

    it('should NOT flush deferred start when execute() carries sessionId -1', async () => {
      (getSessionId as jest.Mock).mockResolvedValue(-1);
      await plugin.start();

      const mockEvent: SegmentEvent = {
        type: EventType.TrackEvent,
        event: 'no_session_yet',
        properties: {},
        context: {},
      } as any;
      (getSessionReplayProperties as jest.Mock).mockResolvedValue({});

      await plugin.execute(mockEvent);

      expect(start).not.toHaveBeenCalled();
    });

    it('should flush deferred start only once across multiple execute() calls', async () => {
      (getSessionId as jest.Mock).mockResolvedValue(-1);
      await plugin.start();

      const eventWithSession: SegmentEvent = {
        type: EventType.TrackEvent,
        event: 'button_clicked',
        properties: { session_id: '1700000000000' },
        context: { device: { id: 'device-abc' } },
      } as any;
      (getSessionReplayProperties as jest.Mock).mockResolvedValue({});

      await plugin.execute(eventWithSession);
      await plugin.execute(eventWithSession);

      expect(start).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should call stop', async () => {
      await plugin.stop();
      expect(stop).toHaveBeenCalled();
    });
  });
});

describe('createSegmentSessionReplayPlugin', () => {
  it('should create a new SegmentSessionReplayPlugin instance', () => {
    const config = { apiKey: 'test-key' };
    const plugin = createSegmentSessionReplayPlugin(config);

    expect(plugin).toBeInstanceOf(SegmentSessionReplayPlugin);
    expect((plugin as any).sessionReplayConfig).toBe(config);
  });
});
