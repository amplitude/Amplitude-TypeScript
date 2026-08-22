import { Plugin, PluginType, type SegmentEvent, EventType, SegmentClient } from '@segment/analytics-react-native';

import {
  type SessionReplayConfig,
  init,
  setDeviceId,
  setSessionId,
  start,
  stop,
} from '@amplitude/session-replay-react-native';
import { VERSION } from './version';

/**
 * Configuration for the Segment Session Replay plugin.
 *
 * Extends the standalone `SessionReplayConfig` with plugin-owned options. The
 * standalone SDK requires an explicit `start()`, so `autoStart` lives here to
 * keep "add the plugin and record" working without the caller wiring it up.
 */
export interface SegmentSessionReplayPluginConfig extends SessionReplayConfig {
  /**
   * Whether to automatically start recording when the plugin is configured
   * @default true
   */
  autoStart?: boolean;
}

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

  private sessionReplayConfig: SegmentSessionReplayPluginConfig;

  // @review: This is to ensure the plugin is initialized before the first event is processed.
  // because `configure` is not asynchronous
  private initPromise: Promise<void> | null = null;

  constructor(config: SegmentSessionReplayPluginConfig) {
    super();
    this.sessionReplayConfig = config;
  }

  async configure(analytics: SegmentClient): Promise<void> {
    super.configure(analytics);
    const { autoStart = true, ...sessionReplayConfig } = this.sessionReplayConfig;
    this.initPromise = init({
      deviceId: analytics.userInfo.get().anonymousId,
      ...sessionReplayConfig,
    });
    await this.initPromise;

    if (autoStart) {
      await start();
    }
  }

  async execute(event: SegmentEvent): Promise<SegmentEvent> {
    await this.initPromise;

    const sessionId = getSessionId(event);
    const deviceId = getDeviceId(event);

    await setSessionId(sessionId);
    await setDeviceId(deviceId);

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

export function createSegmentSessionReplayPlugin(config: SegmentSessionReplayPluginConfig): Plugin {
  return new SegmentSessionReplayPlugin(config);
}
