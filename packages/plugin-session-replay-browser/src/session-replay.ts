import {
  BrowserClient,
  BrowserConfig,
  DestinationPlugin,
  EnrichmentPlugin,
  Event,
  Result,
} from '@amplitude/analytics-types';
import * as sessionReplay from '@amplitude/session-replay-browser';
import { DEFAULT_SESSION_START_EVENT } from './constants';
import { SessionReplayOptions } from './typings/session-replay';

class SessionReplayEnrichmentPlugin implements EnrichmentPlugin {
  name = '@amplitude/plugin-session-replay-browser-enrichment';
  type = 'enrichment' as const;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async setup(_config: BrowserConfig, _client: BrowserClient) {}

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
}

export class SessionReplayPlugin implements DestinationPlugin {
  name = '@amplitude/plugin-session-replay-browser';
  type = 'destination' as const;
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  options: SessionReplayOptions;

  constructor(options?: SessionReplayOptions) {
    this.options = { ...options };
  }

  async setup(config: BrowserConfig, client: BrowserClient) {
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
      privacyConfig: {
        blockSelector: this.options.privacyConfig?.blockSelector,
      },
    }).promise;

    // add enrichment plugin to add session replay properties to events
    client.add(new SessionReplayEnrichmentPlugin());
  }

  async execute(event: Event): Promise<Result> {
    return Promise.resolve({
      event,
      code: 200,
      message: 'success',
    });
  }

  async flush(): Promise<void> {
    await sessionReplay.flush(false);
  }

  async teardown(): Promise<void> {
    sessionReplay.shutdown();
  }

  getSessionReplayProperties() {
    return sessionReplay.getSessionReplayProperties();
  }
}

export const sessionReplayPlugin: (options?: SessionReplayOptions) => EnrichmentPlugin = (
  options?: SessionReplayOptions,
) => {
  return new SessionReplayPlugin(options);
};
