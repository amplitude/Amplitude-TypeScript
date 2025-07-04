import { Plugin, PluginType, type SegmentEvent, EventType, SegmentClient } from '@segment/analytics-react-native';

import {
  type SessionReplayConfig,
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
    await start();
  }

  async stop(): Promise<void> {
    await this.initPromise;
    await stop();
  }
}

export function createSegmentSessionReplayPlugin(config: SessionReplayConfig): Plugin {
  return new SegmentSessionReplayPlugin(config);
}
