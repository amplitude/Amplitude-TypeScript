import { CampaignParser, isCampaignEvent, isSessionExpired } from '@amplitude/analytics-client-common';
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
import { CreateWebAttributionPlugin, Options } from './typings/web-attribution';

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

      // Check if the most recent session ID is expired
      const isMostRecentSessionExpired = isSessionExpired(config.sessionTimeout, config.lastEventTime);

      // Check if attribution event will be tracked
      if (isNewCampaign(currentCampaign, previousCampaign, pluginConfig, isMostRecentSessionExpired)) {
        // Set default session ID to be the most recent session ID
        let sessionId = config.sessionId ?? -1;

        // Check if most recent session ID is expired OR if `resetSessionOnNewCampaign` set to true
        // If yes, set a new session ID
        if (isMostRecentSessionExpired || pluginConfig.resetSessionOnNewCampaign) {
          sessionId = Date.now();
          amplitude.setSessionId(sessionId);

          if (pluginConfig.resetSessionOnNewCampaign) {
            config.loggerProvider.log('Created a new session for new campaign.');
          }
        }

        // Create campaign event
        const campaignEvent = createCampaignEvent(currentCampaign, pluginConfig);
        campaignEvent.session_id = sessionId;
        // Cache campaign event with its associated session ID as key
        campaignPerSession[sessionId] = campaignEvent;
        // Additionally, track the same event
        amplitude.track(campaignEvent);

        void storage.set(storageKey, currentCampaign);
      }
    },

    execute: async (event: Event) => {
      if (event.session_id) {
        // Check a campaign event cache exists for session ID
        const campaignEvent = campaignPerSession[event.session_id];
        if (campaignEvent) {
          // If yes, merge first seen event with with campaign event.
          // It is possible that `event` is equal to `campaignEvent`
          // when `campaignEvent` is what is first passed to `execute`.
          event.user_properties = mergeDeep<Event['user_properties']>(
            campaignEvent.user_properties,
            event.user_properties,
          );
          event.event_properties = {
            ...event.event_properties,
            ...campaignEvent.event_properties,
          };
          if (Object.keys(event.event_properties).length === 0) {
            delete event.event_properties;
          }

          // Remove cached campaign event
          delete campaignPerSession[event.session_id];
        } else if (isCampaignEvent(event)) {
          // If no campaign event event cache for session ID exists,
          // then campaign event has been merged with another event
          // and this is a dupe that must be dropped.
          return null;
        }
      }

      return event;
    },
  };

  return plugin;
};

const isObject = (item: any): item is Record<string, any> =>
  Boolean(item) && typeof item === 'object' && !Array.isArray(item);

const mergeDeep = <T = any>(target: any, source: any): T => {
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) {
          Object.assign(target, { [key]: {} });
        }
        mergeDeep<T>(target[key], source[key]);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return target as T;
};
