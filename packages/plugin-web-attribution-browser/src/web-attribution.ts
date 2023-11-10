import { CampaignParser, isSessionTrackingEnabled } from '@amplitude/analytics-client-common';
import {
  BeforePlugin,
  BrowserClient,
  BrowserConfig,
  Campaign,
  Event,
  IdentifyEvent,
  Storage,
} from '@amplitude/analytics-types';
import { createCampaignEvent, getDefaultExcludedReferrers, getStorageKey, isNewCampaign } from './helpers';
import { CreateWebAttributionPlugin, DEFAULT_SESSION_START_EVENT, Options } from './typings/web-attribution';
import { isNewSession } from '@amplitude/analytics-client-common';

export const webAttributionPlugin: CreateWebAttributionPlugin = function (options: Options = {}) {
  const campaignPerSession: { [sessionId: number]: IdentifyEvent | undefined } = {};

  const plugin: BeforePlugin = {
    name: '@amplitude/plugin-web-attribution-browser',
    type: 'before',

    setup: async function (config: BrowserConfig, amplitude: BrowserClient) {
      const pluginConfig = {
        initialEmptyValue: 'EMPTY',
        resetSessionOnNewCampaign: false,
        excludeReferrers: getDefaultExcludedReferrers(config.cookieOptions?.domain),
        ...options,
      };
      config.loggerProvider.log('Installing @amplitude/plugin-web-attribution-browser.');

      // Share cookie storage with user session storage
      const storage = config.cookieStorage as unknown as Storage<Campaign>;
      const storageKey = getStorageKey(config.apiKey, 'MKTG');

      const [currentCampaign, previousCampaign] = await Promise.all([
        new CampaignParser().parse(),
        storage.get(storageKey),
      ]);

      const isEventInNewSession = isNewSession(config.sessionTimeout, config.lastEventTime);

      if (isNewCampaign(currentCampaign, previousCampaign, pluginConfig, isEventInNewSession)) {
        const campaignEvent = createCampaignEvent(currentCampaign, pluginConfig);

        const sessionId = Date.now();
        if (pluginConfig.resetSessionOnNewCampaign) {
          if (isSessionTrackingEnabled(config.defaultTracking)) {
            // store campaign data for the new session and apply it to 'session_start' event in execute()
            campaignPerSession[sessionId] = campaignEvent;
          }
          amplitude.setSessionId(sessionId);
          config.loggerProvider.log('Created a new session for new campaign.');
        }

        // handle case of no session events
        if (!campaignPerSession[sessionId]) {
          config.loggerProvider.log('Tracking attribution.');
          amplitude.track(campaignEvent);
        }

        void storage.set(storageKey, currentCampaign);
      }
    },

    execute: async (event: Event) => {
      if (isSessionStartEvent(event) && event?.session_id) {
        const campaignEvent = campaignPerSession[event.session_id];
        if (campaignEvent) {
          // merge campaign properties on to session start event
          event.user_properties = campaignEvent.user_properties;
          event.event_properties = {
            ...event.event_properties,
            ...campaignEvent.event_properties,
          };
        }
        // clear campaign data for the session
        campaignPerSession[event.session_id] = undefined;
      }

      return event;
    },
  };

  return plugin;
};

const isSessionStartEvent = (event: Event) => event.event_type === DEFAULT_SESSION_START_EVENT;
