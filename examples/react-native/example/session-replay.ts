import {
  BrowserConfig,
  EnrichmentPlugin,
  Event,
} from '@amplitude/analytics-types';
import {NativeModules} from 'react-native';

const {SessionReplayPluginModule} = NativeModules;

export class SessionReplayPlugin implements EnrichmentPlugin {
  name = '@amplitude/plugin-session-replay-react-native';
  type = 'enrichment' as const;
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;

  constructor() {}

  async setup(config: BrowserConfig): Promise<void> {
    this.config = config;
    console.log(
      `Installing @amplitude/plugin-session-replay-react-native, version 0.1.`,
    );
    await SessionReplayPluginModule.setup(
      config.apiKey,
      config.deviceId,
      config.sessionId,
    );
  }

  async execute(event: Event): Promise<Event | null> {
    // On event, synchronize the session id to the what's on the browserConfig (source of truth)
    // Choosing not to read from event object here, concerned about offline/delayed events messing up the state stored
    // in SR.
    if (
      this.config.sessionId &&
      this.config.sessionId !== (await SessionReplayPluginModule.getSessionId())
    ) {
      await SessionReplayPluginModule.setSessionId(this.config.sessionId);
    }
    // Treating config.sessionId as source of truth, if the event's session id doesn't match, the
    // event is not of the current session (offline/late events). In that case, don't tag the events
    if (this.config.sessionId && this.config.sessionId === event.session_id) {
      const sessionRecordingProperties =
        await SessionReplayPluginModule.getSessionReplayProperties();
      event.event_properties = {
        ...event.event_properties,
        ...sessionRecordingProperties,
      };
      console.log('event', event);
    }
    return Promise.resolve(event);
  }

  async teardown(): Promise<void> {
    await SessionReplayPluginModule.teardown();
    // the following are initialized in setup() which will always be called first
    // here we reset them to null to prevent memory leaks
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.config = null;
  }

  async getSessionReplayProperties() {
    return SessionReplayPluginModule.getSessionReplayProperties();
  }
}
