import {
  LogLevel,
  type EnrichmentPlugin,
  type Event,
  type ReactNativeClient,
  type ReactNativeConfig,
} from '@amplitude/analytics-types';

import { VERSION } from './version';
import { SessionReplayPluginConfig, getDefaultSessionReplayPluginConfig } from './plugin-session-replay-config';
import { getSessionId, getSessionReplayProperties, init, setSessionId, start, stop } from './session-replay';
import { SessionReplayLogger } from './logger';

export class SessionReplayPlugin implements EnrichmentPlugin<ReactNativeClient, ReactNativeConfig> {
  name = '@amplitude/plugin-session-replay-react-native';
  type = 'enrichment' as const;

  private config!: ReactNativeConfig;
  private isInitialized = false;

  private sessionReplayConfig: SessionReplayPluginConfig;
  private logger: SessionReplayLogger = new SessionReplayLogger();

  constructor(config: SessionReplayPluginConfig = {}) {
    this.sessionReplayConfig = {
      ...getDefaultSessionReplayPluginConfig(),
      ...config,
    };

    this.logger.enable(this.sessionReplayConfig.logLevel ?? LogLevel.Warn);
    this.logger.log('Initializing SessionReplayPlugin with config: ', this.sessionReplayConfig);
  }

  async setup(config: ReactNativeConfig, _: ReactNativeClient): Promise<void> {
    this.config = config;
    this.logger.log(`Installing @amplitude/plugin-session-replay-react-native, version ${VERSION}.`);
    await init({
      apiKey: config.apiKey,
      deviceId: config.deviceId,
      sessionId: config.sessionId,
      serverZone: config.serverZone as 'EU' | 'US',
      sampleRate: this.sessionReplayConfig.sampleRate ?? 1,
      enableRemoteConfig: this.sessionReplayConfig.enableRemoteConfig ?? true,
      logLevel: this.sessionReplayConfig.logLevel ?? LogLevel.Warn,
      autoStart: this.sessionReplayConfig.autoStart ?? true,
      logger: this.logger,
    });
    this.isInitialized = true;
  }

  async execute(event: Event): Promise<Event | null> {
    if (!this.isInitialized) {
      return Promise.resolve(event);
    }

    // On event, synchronize the session id to the what's on the browserConfig (source of truth)
    // Choosing not to read from event object here, concerned about offline/delayed events messing up the state stored
    // in SR.
    if (this.config.sessionId && this.config.sessionId !== (await getSessionId())) {
      await setSessionId(this.config.sessionId);
    }
    // Treating config.sessionId as source of truth, if the event's session id doesn't match, the
    // event is not of the current session (offline/late events). In that case, don't tag the events
    if (this.config.sessionId && this.config.sessionId === event.session_id) {
      const sessionRecordingProperties = await getSessionReplayProperties();
      event.event_properties = {
        ...event.event_properties,
        ...sessionRecordingProperties,
      };
    }
    return Promise.resolve(event);
  }

  async start(): Promise<void> {
    if (this.isInitialized) {
      await start();
    }
  }

  async stop(): Promise<void> {
    if (this.isInitialized) {
      await stop();
    }
  }

  async teardown(): Promise<void> {
    if (this.isInitialized) {
      await stop();
    }

    this.config = null as unknown as ReactNativeConfig;
    this.isInitialized = false;
  }

  async getSessionReplayProperties() {
    if (!this.isInitialized) {
      return {};
    }
    return getSessionReplayProperties();
  }
}
