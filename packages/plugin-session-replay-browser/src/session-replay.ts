import { getAnalyticsConnector } from '@amplitude/analytics-client-common';
import {
  BrowserClient,
  BrowserConfig,
  DestinationPlugin,
  EnrichmentPlugin,
  Event,
  Result,
  SpecialEventType,
} from '@amplitude/analytics-types';
import * as sessionReplay from '@amplitude/session-replay-browser';
import { parseUserProperties } from './helpers';
import { SessionReplayOptions } from './typings/session-replay';
import { VERSION } from './version';
const ENRICHMENT_PLUGIN_NAME = '@amplitude/plugin-session-replay-enrichment-browser';

class SessionReplayEnrichmentPlugin implements EnrichmentPlugin {
  name = ENRICHMENT_PLUGIN_NAME;
  type = 'enrichment' as const;
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;

  async setup(_config: BrowserConfig, _client: BrowserClient) {
    this.config = _config;
  }

  async execute(event: Event) {
    // On event, synchronize the session id to the what's on the browserConfig (source of truth)
    // Choosing not to read from event object here, concerned about offline/delayed events messing up the state stored
    // in SR.
    if (this.config.sessionId && this.config.sessionId !== sessionReplay.getSessionId()) {
      let userProperties;
      if (this.config.instanceName) {
        const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
        userProperties = identityStore.getIdentity().userProperties;
      }
      await sessionReplay.setSessionId(this.config.sessionId, this.config.deviceId, {
        userProperties: userProperties || {},
      }).promise;
    }

    // Treating config.sessionId as source of truth, if the event's session id doesn't match, the
    // event is not of the current session (offline/late events). In that case, don't tag the events
    if (this.config.sessionId && this.config.sessionId === event.session_id) {
      let userProperties;
      if (event.event_type === SpecialEventType.IDENTIFY) {
        userProperties = parseUserProperties(event);
      }
      await sessionReplay.evaluateTargetingAndRecord({ event, userProperties });
      const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
      event.event_properties = {
        ...event.event_properties,
        ...sessionRecordingProperties,
      };
    }
    return Promise.resolve(event);
  }
}

export class SessionReplayPlugin implements DestinationPlugin {
  name = '@amplitude/plugin-session-replay-browser';
  type = 'destination' as const;
  // this.client is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  clientRemove: BrowserClient['remove'];
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

  async setup(config: BrowserConfig, client?: BrowserClient) {
    if (!client) {
      config.loggerProvider.error('SessionReplayPlugin requires v1.9.1+ of the Amplitude SDK.');
      return;
    }

    config.loggerProvider.log(`Installing @amplitude/plugin-session-replay, version ${VERSION}.`);

    this.clientRemove = client.remove.bind(client);
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

    let userProperties;
    if (this.config.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      userProperties = identityStore.getIdentity().userProperties;
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
      userProperties: userProperties,
    }).promise;

    // add enrichment plugin to add session replay properties to events
    await client.add(new SessionReplayEnrichmentPlugin()).promise;
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
    await this.clientRemove(ENRICHMENT_PLUGIN_NAME).promise;
    sessionReplay.shutdown();
    // the following are initialized in setup() which will always be called first
    // here we reset them to null to prevent memory leaks
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.config = null;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.clientRemove = null;
  }

  getSessionReplayProperties() {
    return sessionReplay.getSessionReplayProperties();
  }
}

export const sessionReplayPlugin: (options?: SessionReplayOptions) => DestinationPlugin = (
  options?: SessionReplayOptions,
) => {
  return new SessionReplayPlugin(options);
};
