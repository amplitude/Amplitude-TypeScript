/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { EnrichmentPlugin, Event, ReactNativeClient, ReactNativeConfig } from '@amplitude/analytics-types';

import { PluginSessionReplayReactNative } from './native-module';
import { VERSION } from './version';
import { SessionReplayConfig, getDefaultConfig } from './session-replay-config';

export class SessionReplayPlugin implements EnrichmentPlugin<ReactNativeClient, ReactNativeConfig> {
  name = '@amplitude/plugin-session-replay-react-native';
  type = 'enrichment' as const;
  // this.config is defined in setup() which will always be called first

  // @ts-ignore
  config: ReactNativeConfig;
  isInitialized = false;

  sessionReplayConfig: SessionReplayConfig;

  constructor(config: SessionReplayConfig = {}) {
    this.sessionReplayConfig = {
      ...getDefaultConfig(),
      ...config,
    };
    console.log('Initializing SessionReplayPlugin with config: ', this.sessionReplayConfig);
  }

  async setup(config: ReactNativeConfig, _: ReactNativeClient): Promise<void> {
    this.config = config;
    console.log(`Installing @amplitude/plugin-session-replay-react-native, version ${VERSION}.`);
    await PluginSessionReplayReactNative.setup(
      config.apiKey,
      config.deviceId,
      config.sessionId,
      this.sessionReplayConfig.sampleRate ?? 1,
      this.sessionReplayConfig.enableRemoteConfig ?? true,
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
    if (this.config.sessionId && this.config.sessionId !== (await PluginSessionReplayReactNative.getSessionId())) {
      await PluginSessionReplayReactNative.setSessionId(this.config.sessionId);
    }
    // Treating config.sessionId as source of truth, if the event's session id doesn't match, the
    // event is not of the current session (offline/late events). In that case, don't tag the events
    if (this.config.sessionId && this.config.sessionId === event.session_id) {
      const sessionRecordingProperties = await PluginSessionReplayReactNative.getSessionReplayProperties();
      event.event_properties = {
        ...event.event_properties,
        ...sessionRecordingProperties,
      };
    }
    return Promise.resolve(event);
  }

  async start(): Promise<void> {
    if (this.isInitialized) {
      await PluginSessionReplayReactNative.start();
    }
  }

  async stop(): Promise<void> {
    if (this.isInitialized) {
      await PluginSessionReplayReactNative.stop();
    }
  }

  async teardown(): Promise<void> {
    if (this.isInitialized) {
      await PluginSessionReplayReactNative.teardown();
    }
    // the following are initialized in setup() which will always be called first
    // here we reset them to null to prevent memory leaks

    // @ts-ignore
    this.config = null;
    this.isInitialized = false;
  }

  async getSessionReplayProperties() {
    if (!this.isInitialized) {
      return {};
    }
    return PluginSessionReplayReactNative.getSessionReplayProperties();
  }
}
