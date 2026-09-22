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
  setOptOut,
  start,
  stop,
  teardown,
} from '@amplitude/session-replay-react-native';
import { VERSION } from '../src/version';

// Mock the session replay module
jest.mock('@amplitude/session-replay-react-native', () => ({
  init: jest.fn(),
  setDeviceId: jest.fn(),
  setSessionId: jest.fn(),
  setOptOut: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  teardown: jest.fn(),
}));

describe('SegmentSessionReplayPlugin', () => {
  let plugin: SegmentSessionReplayPlugin;
  let mockAnalytics: jest.Mocked<SegmentClient>;
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();

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

    it('should start recording after init by default', async () => {
      await plugin.configure(mockAnalytics);

      expect(start).toHaveBeenCalled();
    });

    it('should not start recording when autoStart is false', async () => {
      const manualStartPlugin = new SegmentSessionReplayPlugin({ ...mockConfig, autoStart: false });

      await manualStartPlugin.configure(mockAnalytics);

      expect(init).toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    });

    it('should not forward autoStart to the session replay SDK', async () => {
      const manualStartPlugin = new SegmentSessionReplayPlugin({ ...mockConfig, autoStart: false });

      await manualStartPlugin.configure(mockAnalytics);

      const [initConfig] = (init as jest.Mock).mock.calls[0] as [Record<string, unknown>];
      expect(Object.keys(initConfig)).not.toContain('autoStart');
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

      const result = await plugin.execute(mockEvent);

      expect(setSessionId).toHaveBeenCalledWith(123);
      expect(setDeviceId).toHaveBeenCalledWith('device-123');
      expect((result as any).properties).toEqual({
        session_id: '123',
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

      const result = await plugin.execute(mockEvent);

      expect(setSessionId).toHaveBeenCalledWith(456);
      expect(setDeviceId).toHaveBeenCalledWith('device-456');
      expect((result as any).properties).toEqual({
        session_id: '456',
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

    it('should preserve non-track/screen events', async () => {
      const mockEvent: SegmentEvent = {
        type: EventType.IdentifyEvent,
        userId: 'user-123',
        traits: {},
      } as any;

      const result = await plugin.execute(mockEvent);

      expect(result).toEqual({
        type: EventType.IdentifyEvent,
        userId: 'user-123',
        traits: {},
      });
      expect(mockEvent).toEqual(result);
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

    it('should preserve existing properties without adding session replay properties', async () => {
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

      const result = await plugin.execute(mockEvent);

      expect((result as any).properties).toEqual({
        existing_prop: 'value',
        session_id: '123',
      });
    });
  });

  describe('shutdown', () => {
    it('should tear down session replay', async () => {
      await plugin.shutdown();
      expect(teardown).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should call start', async () => {
      await plugin.start();
      expect(start).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should call stop', async () => {
      await plugin.stop();
      expect(stop).toHaveBeenCalled();
    });
  });

  describe('setOptOut', () => {
    it('should update the session replay opt-out state', async () => {
      await plugin.setOptOut(true);
      expect(setOptOut).toHaveBeenCalledWith(true);
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
