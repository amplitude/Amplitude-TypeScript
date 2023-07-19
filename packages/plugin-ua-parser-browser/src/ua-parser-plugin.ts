import { BrowserConfig, EnrichmentPlugin, Event } from '@amplitude/analytics-types';
import { CreateUaParserPlugin, Options } from './typings/ua-parser-plugin';
import UAParser from '@amplitude/ua-parser-js';

export const uaParserPlugin: CreateUaParserPlugin = function (
  options: Options = {
    osName: true,
    osVersion: true,
    deviceManufacturer: true,
    deviceModel: true,
  },
) {
  const { osName = true, osVersion = true, deviceManufacturer = true, deviceModel = true } = options;

  let uaResult: UAParser.IResult;

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-ua-parser',
    type: 'enrichment',

    setup: async function (config: BrowserConfig) {
      let userAgent: string | undefined;
      /* istanbul ignore else */
      if (typeof navigator !== 'undefined') {
        userAgent = navigator.userAgent;
      }

      uaResult = new UAParser(userAgent).getResult();

      config.loggerProvider.log('Installing @amplitude/plugin-ua-parser.');
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
