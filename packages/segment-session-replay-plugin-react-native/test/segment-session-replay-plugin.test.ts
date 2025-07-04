// FIXME: remove these eslint rules
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { PluginType, EventType, type SegmentEvent, type SegmentClient } from '@segment/analytics-react-native';
import { SegmentSessionReplayPlugin, createSegmentSessionReplayPlugin } from '../src/segment-session-replay-plugin';
import {
  init,
  setDeviceId,
  setSessionId,
  getSessionReplayProperties,
  start,
  stop,
} from '@amplitude/session-replay-react-native';

// Mock the session replay module
jest.mock('@amplitude/session-replay-react-native', () => ({
  init: jest.fn(),
  setDeviceId: jest.fn(),
  setSessionId: jest.fn(),
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
      expect(plugin.version).toBe('0.0.1-beta.1');
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
});

describe('createSegmentSessionReplayPlugin', () => {
  it('should create a new SegmentSessionReplayPlugin instance', () => {
    const config = { apiKey: 'test-key' };
    const plugin = createSegmentSessionReplayPlugin(config);

    expect(plugin).toBeInstanceOf(SegmentSessionReplayPlugin);
    expect((plugin as any).sessionReplayConfig).toBe(config);
  });
});
