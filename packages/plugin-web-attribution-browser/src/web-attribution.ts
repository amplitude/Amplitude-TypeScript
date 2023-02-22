import { CampaignParser } from '@amplitude/analytics-client-common';
import {
  BeforePlugin,
  BrowserClient,
  BrowserConfig,
  Campaign,
  Event,
  PluginType,
  Storage,
} from '@amplitude/analytics-types';
import { createCampaignEvent, getStorageKey, isNewCampaign } from './helpers';
import { CreateWebAttributionPlugin, CreateWebAttributionPluginParameters, Options } from './typings/web-attribution';

export const webAttributionPlugin: CreateWebAttributionPlugin = function (
  ...args: CreateWebAttributionPluginParameters
) {
  let amplitude: BrowserClient | undefined;
  let options: Options = {};

  const [clientOrOptions, configOrUndefined] = args;
  if (clientOrOptions && 'init' in clientOrOptions) {
    amplitude = clientOrOptions;
    if (configOrUndefined) {
      options = configOrUndefined;
    }
  } else if (clientOrOptions) {
    options = clientOrOptions;
  }

  const excludeReferrers = options.excludeReferrers ?? [];
  if (typeof location !== 'undefined') {
    excludeReferrers.unshift(location.hostname);
  }

  options = {
    disabled: false,
    initialEmptyValue: 'EMPTY',
    resetSessionOnNewCampaign: false,
    ...options,
    excludeReferrers,
  };

  const plugin: BeforePlugin = {
    name: 'web-attribution',
    type: PluginType.BEFORE,

    setup: async function (config: BrowserConfig, client?: BrowserClient) {
      amplitude = amplitude ?? client;
      if (!amplitude) {
        const receivedType = clientOrOptions ? 'Options' : 'undefined';
        config.loggerProvider.error(
          `Argument of type '${receivedType}' is not assignable to parameter of type 'BrowserClient'.`,
        );
        return;
      }

      if (options.disabled) {
        config.loggerProvider.log('@amplitude/plugin-web-attribution-browser is disabled. Attribution is not tracked.');
        return;
      }

      config.loggerProvider.log('Installing @amplitude/plugin-web-attribution-browser.');

      if (!client && !config.attribution?.disabled) {
        config.loggerProvider.warn(
          '@amplitude/plugin-web-attribution-browser overrides web attribution behavior defined in @amplitude/analytics-browser. Resolve by disabling web attribution tracking in @amplitude/analytics-browser.',
        );
        config.attribution = {
          disabled: true,
        };
      }

      // Share cookie storage with user session storage
      const storage = config.cookieStorage as unknown as Storage<Campaign>;
      const storageKey = getStorageKey(config.apiKey);

      const [currentCampaign, previousCampaign] = await Promise.all([
        new CampaignParser().parse(),
        storage.get(storageKey),
      ]);

      // For Amplitude-internal functionality
      // if pluginEnabledOverride === undefined then use plugin default logic
      // if pluginEnabledOverride === true then track attribution
      // if pluginEnabledOverride === false then do not track attribution
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const pluginEnabledOverride: boolean | undefined = (this as any).__pluginEnabledOverride;

      if (pluginEnabledOverride ?? isNewCampaign(currentCampaign, previousCampaign, options)) {
        if (options.resetSessionOnNewCampaign) {
          amplitude.setSessionId(Date.now());
          config.loggerProvider.log('Created a new session for new campaign.');
        }
        config.loggerProvider.log('Tracking attribution.');
        const campaignEvent = createCampaignEvent(currentCampaign, options);
        amplitude.track(campaignEvent);
        void storage.set(storageKey, currentCampaign);
      }
    },

    execute: async (event: Event) => event,
  };

  // For Amplitude-internal functionality
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  (plugin as any).__pluginEnabledOverride = undefined;

  return plugin;
};
