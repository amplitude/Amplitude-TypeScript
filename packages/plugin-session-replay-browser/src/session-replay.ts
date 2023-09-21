import { BrowserConfig, EnrichmentPlugin, Event } from '@amplitude/analytics-types';
import * as sessionReplay from '@amplitude/session-replay-browser';
import { DEFAULT_SESSION_START_EVENT } from './constants';
import { SessionReplayOptions } from './typings/session-replay';
export class SessionReplayPlugin implements EnrichmentPlugin {
  name = '@amplitude/plugin-session-replay-browser';
  type = 'enrichment' as const;
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  options: SessionReplayOptions;

  constructor(options?: SessionReplayOptions) {
    this.options = { ...options };
  }

  async setup(config: BrowserConfig) {
    config.loggerProvider.log('Installing @amplitude/plugin-session-replay.');

    this.config = config;

    if (typeof config.defaultTracking === 'boolean') {
      if (config.defaultTracking === false) {
        config.defaultTracking = {
          pageViews: false,
          formInteractions: false,
          fileDownloads: false,
          sessions: true,
        };
      }
    } else {
      config.defaultTracking = {
        ...config.defaultTracking,
        sessions: true,
      };
    }

    await sessionReplay.init(config.apiKey, {
      instanceName: this.config.instanceName,
      deviceId: this.config.deviceId,
      optOut: this.config.optOut,
      sessionId: this.config.sessionId,
      loggerProvider: this.config.loggerProvider,
      logLevel: this.config.logLevel,
      flushMaxRetries: this.config.flushMaxRetries,
      serverZone: this.config.serverZone,
      sampleRate: this.options.sampleRate,
    }).promise;
  }

  async execute(event: Event) {
    if (event.event_type === DEFAULT_SESSION_START_EVENT && event.session_id) {
      sessionReplay.setSessionId(event.session_id);
    }

    const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
    event.event_properties = {
      ...event.event_properties,
      ...sessionRecordingProperties,
    };

    return Promise.resolve(event);
  }

  async teardown(): Promise<void> {
    sessionReplay.shutdown();
  }
}

export const sessionReplayPlugin: (options?: SessionReplayOptions) => EnrichmentPlugin = (
  options?: SessionReplayOptions,
) => {
  return new SessionReplayPlugin(options);
};
