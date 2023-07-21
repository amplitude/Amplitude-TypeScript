import { BrowserConfig, EnrichmentPlugin, Event } from '@amplitude/analytics-types';
import { CreateUserAgentEnrichmentPlugin, Options } from './typings/user-agent-enrichment-plugin';
import UAParser from '@amplitude/ua-parser-js';

export const userAgentEnrichmentPlugin: CreateUserAgentEnrichmentPlugin = function (options: Options = {}) {
  const { osName = true, osVersion = true, deviceManufacturer = true, deviceModel = true } = options;

  let uaResult: UAParser.IResult;

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-user-agent-enrichment-browser',
    type: 'enrichment',

    setup: async function (config: BrowserConfig) {
      let userAgent: string | undefined;
      /* istanbul ignore else */
      if (typeof navigator !== 'undefined') {
        userAgent = navigator.userAgent;
      }

      uaResult = new UAParser(userAgent).getResult();

      config.loggerProvider.log('Installing @amplitude/plugin-user-agent-enrichment-browser.');
    },

    execute: async (event: Event) => {
      const uaOsName = uaResult.browser.name;
      const UaOsVersion = uaResult.browser.version;
      const UaDeviceModel = uaResult.device.model || uaResult.os.name;
      const UaDeviceVendor = uaResult.device.vendor;

      return {
        ...event,
        ...(osName && { os_name: uaOsName }),
        ...(osVersion && { os_version: UaOsVersion }),
        ...(deviceManufacturer && { device_manufacturer: UaDeviceVendor }),
        ...(deviceModel && { device_model: UaDeviceModel }),
      };
    },
  };

  return plugin;
};
