import { BrowserConfig, EnrichmentPlugin, Event } from '@amplitude/analytics-types';
import * as sessionReplay from '@amplitude/session-replay-browser';
import { SessionReplayOptions } from './typings/session-replay';
import { VERSION } from './version';

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
    // The user did not explicitly configure forceSessionTracking to false, default to true.
    if (this.options.forceSessionTracking !== false) {
      this.options.forceSessionTracking = true;
    }
  }

  async setup(config: BrowserConfig) {
    config.loggerProvider.log(`Installing @amplitude/plugin-session-replay, version ${VERSION}.`);

    this.config = config;

    if (this.options.forceSessionTracking) {
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
        maskSelector: this.options.privacyConfig?.maskSelector,
        unmaskSelector: this.options.privacyConfig?.unmaskSelector,
        defaultMaskLevel: this.options.privacyConfig?.defaultMaskLevel,
      },
      debugMode: this.options.debugMode,
      configEndpointUrl: this.options.configEndpointUrl,
      shouldInlineStylesheet: this.options.shouldInlineStylesheet,
      version: { type: 'plugin', version: VERSION },
      performanceConfig: this.options.performanceConfig,
      storeType: this.options.storeType,
    }).promise;
  }

  async execute(event: Event) {
    // On event, synchronize the session id to the what's on the browserConfig (source of truth)
    // Choosing not to read from event object here, concerned about offline/delayed events messing up the state stored
    // in SR.
    if (this.config.sessionId && this.config.sessionId !== sessionReplay.getSessionId()) {
      await sessionReplay.setSessionId(this.config.sessionId).promise;
    }
    // Treating config.sessionId as source of truth, if the event's session id doesn't match, the
    // event is not of the current session (offline/late events). In that case, don't tag the events
    if (this.config.sessionId && this.config.sessionId === event.session_id) {
      const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
      event.event_properties = {
        ...event.event_properties,
        ...sessionRecordingProperties,
      };
    }
    return Promise.resolve(event);
  }

  async teardown(): Promise<void> {
    sessionReplay.shutdown();
    // the following are initialized in setup() which will always be called first
    // here we reset them to null to prevent memory leaks
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.config = null;
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
