import {
  type EnrichmentPlugin,
  type Event,
  type ReactNativeClient,
  type ReactNativeConfig,
} from '@amplitude/analytics-types';

import { SessionReplayPluginConfig, getDefaultSessionReplayPluginConfig } from './plugin-session-replay-config';
import { getSessionId, getSessionReplayProperties, privateInit, setSessionId, start, stop } from './session-replay';
import { createSessionReplayLogger } from './logger';

/**
 * Session Replay Plugin for React Native Amplitude SDK.
 * This plugin automatically handles session replay recording and event correlation.
 *
 * The plugin automatically handles:
 * - Device ID and Session ID management
 * - Session ID changes
 * - Event property collection and tracking
 */
export class SessionReplayPlugin implements EnrichmentPlugin<ReactNativeClient, ReactNativeConfig> {
  name = '@amplitude/plugin-session-replay-react-native';
  type = 'enrichment' as const;

  private config: ReactNativeConfig | null = null;
  private isInitialized = false;

  private sessionReplayConfig: Required<SessionReplayPluginConfig>;
  private logger = createSessionReplayLogger();

  /**
   * Create a new Session Replay Plugin instance.
   *
   * @param config - Configuration options for the session replay plugin
   *
   * @example
   * ```typescript
   * const sessionReplayPlugin = new SessionReplayPlugin({
   *   sampleRate: 0.1,
   *   enableRemoteConfig: true,
   *   logLevel: LogLevel.Warn,
   *   autoStart: true
   * });
   * ```
   */
  constructor(config: SessionReplayPluginConfig = {}) {
    this.sessionReplayConfig = {
      ...getDefaultSessionReplayPluginConfig(),
      ...config,
    };

    this.logger.setLogLevel(this.sessionReplayConfig.logLevel);
    this.logger.log('Creating SessionReplayPlugin with config: ', this.sessionReplayConfig);
  }

  /**
   * Set up the Session Replay Plugin with the Amplitude configuration.
   * This method is called automatically by the Amplitude SDK during initialization.
   *
   * @param config - The React Native configuration from the Amplitude SDK
   * @param _ - The React Native client instance (unused)
   * @returns Promise that resolves when setup is complete
   */
  async setup(config: ReactNativeConfig, _: ReactNativeClient): Promise<void> {
    this.config = config;
    await privateInit(
      {
        apiKey: config.apiKey,
        deviceId: config.deviceId,
        sessionId: config.sessionId,
        serverZone: config.serverZone as 'EU' | 'US',
        sampleRate: this.sessionReplayConfig.sampleRate,
        enableRemoteConfig: this.sessionReplayConfig.enableRemoteConfig,
        logLevel: this.sessionReplayConfig.logLevel,
        autoStart: this.sessionReplayConfig.autoStart,
      },
      this.logger,
    );
    this.isInitialized = true;
  }

  async execute(event: Event): Promise<Event | null> {
    if (!this.isInitialized) {
      return Promise.resolve(event);
    }

    // On event, synchronize the session id to the what's on the browserConfig (source of truth)
    // Choosing not to read from event object here, concerned about offline/delayed events messing up the state stored
    // in SR.
    if (this.config?.sessionId && this.config.sessionId !== (await getSessionId())) {
      await setSessionId(this.config.sessionId);
    }
    // Treating config.sessionId as source of truth, if the event's session id doesn't match, the
    // event is not of the current session (offline/late events). In that case, don't tag the events
    if (this.config?.sessionId && this.config.sessionId === event.session_id) {
      const sessionRecordingProperties = await getSessionReplayProperties();
      event.event_properties = {
        ...event.event_properties,
        ...sessionRecordingProperties,
      };
    }
    return Promise.resolve(event);
  }

  /**
   * Start session replay recording.
   * Begins capturing user interactions and screen content for replay.
   *
   * @returns Promise that resolves when recording starts
   */
  async start(): Promise<void> {
    if (this.isInitialized) {
      await start();
    }
  }

  /**
   * Stop session replay recording.
   * Ends the current recording session and processes any captured data.
   *
   * @returns Promise that resolves when recording stops
   */
  async stop(): Promise<void> {
    if (this.isInitialized) {
      await stop();
    }
  }

  async teardown(): Promise<void> {
    if (this.isInitialized) {
      await stop();
    }

    this.config = null;
    this.isInitialized = false;
  }

  /**
   * Get session replay properties for manual event correlation.
   * When you send events to Amplitude, call this method to get the most up-to-date session replay properties for the event.
   *
   * @returns Promise that resolves to an object containing session replay metadata
   *
   * @example
   * ```typescript
   * const sessionReplayProperties = await plugin.getSessionReplayProperties();
   * analytics.track('Button Clicked', {
   *   buttonName: 'submit',
   *   ...sessionReplayProperties
   * });
   * ```
   */
  async getSessionReplayProperties() {
    if (!this.isInitialized) {
      return {};
    }
    return getSessionReplayProperties();
  }
}
