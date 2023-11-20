import { CampaignParser } from '@amplitude/analytics-client-common';
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
        const currentSessionId = config.sessionId ?? -1;

        if (pluginConfig.resetSessionOnNewCampaign) {
          const nextSessionId = Date.now();
          amplitude.setSessionId(nextSessionId);
          campaignPerSession[nextSessionId] = campaignEvent;
          config.loggerProvider.log('Created a new session for new campaign.');
        } else {
          campaignPerSession[currentSessionId] = campaignEvent;
        }

        void storage.set(storageKey, currentCampaign);
      }
    },

    execute: async (event: Event) => {
      if (event.session_id) {
        const campaignEvent = campaignPerSession[event.session_id];
        if (campaignEvent) {
          event.user_properties = mergeDeep<Event['user_properties']>(
            campaignEvent.user_properties,
            event.user_properties,
          );
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
