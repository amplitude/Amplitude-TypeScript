import { Plugin, PluginType, type SegmentEvent, EventType, SegmentClient } from '@segment/analytics-react-native';

import {
  type SessionReplayConfig,
  getSessionId as getSRSessionId,
  getSessionReplayProperties,
  init,
  setDeviceId,
  setSessionId,
  start,
  stop,
} from '@amplitude/session-replay-react-native';
import { VERSION } from './version';

function getSessionId(event: SegmentEvent): number {
  const amplitudeSessionId =
    (event.integrations?.['Actions Amplitude'] as { session_id: number })?.['session_id'] ?? null;
  if (amplitudeSessionId !== null) {
    return amplitudeSessionId;
  }

  if (event.type === EventType.TrackEvent || event.type === EventType.ScreenEvent) {
    const sessionIdRaw = event.properties?.['session_id'];
    const sessionId = Number(sessionIdRaw);
    return Number.isNaN(sessionId) ? -1 : sessionId;
  }
  return -1;
}

function getDeviceId(event: SegmentEvent): string | null {
  return event.context?.device?.id ?? event.anonymousId ?? null;
}

export class SegmentSessionReplayPlugin extends Plugin {
  name = 'amplitude-segment-session-replay-plugin-react-native';
  version: string = VERSION;
  type: PluginType = PluginType.enrichment;

  private sessionReplayConfig: SessionReplayConfig;

  // @review: This is to ensure the plugin is initialized before the first event is processed.
  // because `configure` is not asynchronous
  private initPromise: Promise<void> | null = null;

  // True when start() was called but deferred because no valid session ID (> 0)
  // was available yet.  Flushed by execute() once a valid id arrives.
  private pendingStart = false;

  constructor(config: SessionReplayConfig) {
    super();
    this.sessionReplayConfig = config;
  }

  async configure(analytics: SegmentClient): Promise<void> {
    super.configure(analytics);
    this.initPromise = init({
      deviceId: analytics.userInfo.get().anonymousId,
      ...this.sessionReplayConfig,
    });
    await this.initPromise;
  }

  async execute(event: SegmentEvent): Promise<SegmentEvent> {
    await this.initPromise;

    const sessionId = getSessionId(event);
    const deviceId = getDeviceId(event);

    await setSessionId(sessionId);
    await setDeviceId(deviceId);

    // Flush a deferred start() once the first valid session ID arrives.
    // start() may have been called before any event flowed through here, at
    // which point the native SDK's session ID was still -1 (the default
    // sentinel).  We wait until we have a real id (> 0) before starting
    // native recording to avoid corrupting the replay with sessionId -1.
    if (this.pendingStart && sessionId > 0) {
      this.pendingStart = false;
      await start();
    }

    if (event.type === EventType.TrackEvent || event.type === EventType.ScreenEvent) {
      const properties = await getSessionReplayProperties();
      event.properties = { ...event.properties, ...properties };
    }

    return event;
  }

  async shutdown(): Promise<void> {
    await this.initPromise;
    await stop();
  }

  async start(): Promise<void> {
    await this.initPromise;
    // The native SDK defaults sessionId to -1 until the first Segment event
    // flows through execute() and calls setSessionId() with a real value.
    // Starting under -1 would tag the entire recording with an invalid session,
    // so we defer if the current id is not yet valid (> 0).
    const currentSessionId = await getSRSessionId();
    if (currentSessionId !== null && currentSessionId > 0) {
      await start();
    } else {
      this.pendingStart = true;
    }
  }

  async stop(): Promise<void> {
    await this.initPromise;
    await stop();
  }
}

export function createSegmentSessionReplayPlugin(config: SessionReplayConfig): Plugin {
  return new SegmentSessionReplayPlugin(config);
}
