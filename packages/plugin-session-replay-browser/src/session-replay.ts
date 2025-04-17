import { BrowserClient, BrowserConfig, EnrichmentPlugin, Event } from '@amplitude/analytics-core';
import * as sessionReplay from '@amplitude/session-replay-browser';
import { SessionReplayOptions } from './typings/session-replay';
import { VERSION } from './version';
import { AmplitudeSessionReplay } from '@amplitude/session-replay-browser';

export class SessionReplayPlugin implements EnrichmentPlugin<BrowserClient, BrowserConfig> {
  static pluginName = '@amplitude/plugin-session-replay-browser';
  name = SessionReplayPlugin.pluginName;
  type = 'enrichment' as const;
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  options: SessionReplayOptions;
  srInitOptions: sessionReplay.SessionReplayOptions;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-assignment
  sr: AmplitudeSessionReplay = sessionReplay.createInstance();

  constructor(options?: SessionReplayOptions) {
    this.options = { forceSessionTracking: false, ...options };
    this.srInitOptions = this.options;
  }

  async setup(config: BrowserConfig, _client: BrowserClient) {
    try {
      /* istanbul ignore next */
      config?.loggerProvider.log(`Installing @amplitude/plugin-session-replay, version ${VERSION}.`);

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

      this.srInitOptions = {
        instanceName: this.config.instanceName,
        deviceId: this.options.deviceId ?? this.config.deviceId,
        optOut: this.config.optOut,
        sessionId: this.options.customSessionId ? undefined : this.config.sessionId,
        loggerProvider: this.config.loggerProvider,
        logLevel: this.config.logLevel,
        flushMaxRetries: this.config.flushMaxRetries,
        serverZone: this.config.serverZone,
        configServerUrl: this.options.configServerUrl,
        trackServerUrl: this.options.trackServerUrl,
        sampleRate: this.options.sampleRate,
        privacyConfig: {
          blockSelector: this.options.privacyConfig?.blockSelector,
          maskSelector: this.options.privacyConfig?.maskSelector,
          unmaskSelector: this.options.privacyConfig?.unmaskSelector,
          defaultMaskLevel: this.options.privacyConfig?.defaultMaskLevel,
        },
        debugMode: this.options.debugMode,
        shouldInlineStylesheet: this.options.shouldInlineStylesheet,
        version: { type: 'plugin', version: VERSION },
        performanceConfig: this.options.performanceConfig,
        storeType: this.options.storeType,
        experimental: this.options.experimental,
      };

      await this.sr.init(config.apiKey, this.srInitOptions).promise;
    } catch (error) {
      /* istanbul ignore next */
      config?.loggerProvider.error(`Session Replay: Failed to initialize due to ${(error as Error).message}`);
    }
  }

  async onSessionIdChanged(sessionId: number): Promise<void> {
    this.config.loggerProvider.debug(
      `Analytics session id is changed to ${sessionId}, SR session id is ${String(this.sr.getSessionId())}.`,
    );
    await this.sr.setSessionId(sessionId).promise;
  }

  async onOptOutChanged(optOut: boolean): Promise<void> {
    this.config.loggerProvider.debug(
      `optOut is changed to ${String(optOut)}, calling ${
        optOut ? 'sessionReplay.shutdown()' : 'sessionReplay.init()'
      }.`,
    );
    // TODO: compare optOut with this.sr.getOptOut().
    // Need to add getOptOut() to the interface AmplitudeSessionReplay first.
    if (optOut) {
      this.sr.shutdown();
    } else {
      await this.sr.init(this.config.apiKey, this.srInitOptions).promise;
    }
  }

  async execute(event: Event) {
    try {
      if (this.options.customSessionId) {
        const sessionId = this.options.customSessionId(event);
        if (sessionId) {
          // On event, synchronize the session id to the custom session id from the event. This may
          // suffer from offline/delayed events messing up the state stored
          if (sessionId !== this.sr.getSessionId()) {
            await this.sr.setSessionId(sessionId).promise;
          }

          const sessionRecordingProperties = this.sr.getSessionReplayProperties();
          event.event_properties = {
            ...event.event_properties,
            ...sessionRecordingProperties,
          };
        }
      } else {
        // On event, synchronize the session id to the what's on the browserConfig (source of truth)
        // Choosing not to read from event object here, concerned about offline/delayed events messing up the state stored
        // in SR.
        const sessionId: string | number | undefined = this.config.sessionId;
        if (sessionId && sessionId !== this.sr.getSessionId()) {
          await this.sr.setSessionId(sessionId).promise;
        }

        // Treating config.sessionId as source of truth, if the event's session id doesn't match, the
        // event is not of the current session (offline/late events). In that case, don't tag the events
        if (sessionId && sessionId === event.session_id) {
          const sessionRecordingProperties = this.sr.getSessionReplayProperties();
          event.event_properties = {
            ...event.event_properties,
            ...sessionRecordingProperties,
          };
        }
      }

      return Promise.resolve(event);
    } catch (error) {
      /* istanbul ignore next */
      this.config?.loggerProvider.error(`Session Replay: Failed to enrich event due to ${(error as Error).message}`);
      return Promise.resolve(event);
    }
  }

  async teardown(): Promise<void> {
    try {
      this.sr.shutdown();
      // the following are initialized in setup() which will always be called first
      // here we reset them to null to prevent memory leaks
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.config = null;
    } catch (error) {
      /* istanbul ignore next */
      this.config?.loggerProvider.error(`Session Replay: teardown failed due to ${(error as Error).message}`);
    }
  }

  getSessionReplayProperties() {
    return this.sr.getSessionReplayProperties();
  }
}

export const sessionReplayPlugin: (options?: SessionReplayOptions) => EnrichmentPlugin = (
  options?: SessionReplayOptions,
) => {
  return new SessionReplayPlugin(options);
};
