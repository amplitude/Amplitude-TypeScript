import { BeforePlugin, BrowserConfig, Event, PluginType } from '@amplitude/analytics-types';

import UAParser from '@amplitude/ua-parser-js';
import { UUID } from '../utils/uuid';
import { getLanguage } from '../utils/language';

const BROWSER_PLATFORM = 'Web';
const IP_ADDRESS = '$remote';

export class Context implements BeforePlugin {
  name = 'context';
  type = PluginType.BEFORE as const;

  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  eventId = 0;
  uaResult: UAParser.IResult;

  constructor() {
    this.uaResult = new UAParser(navigator.userAgent).getResult();
  }

  setup(config: BrowserConfig): Promise<undefined> {
    this.config = config;
    return Promise.resolve(undefined);
  }

  execute(context: Event): Promise<Event> {
    return new Promise((resolve) => {
      const osName = this.uaResult.browser.name;
      const osVersion = this.uaResult.browser.version;
      const deviceModel = this.uaResult.device.model || this.uaResult.os.name;
      const deviceVendor = this.uaResult.device.vendor;

      const contextEvent: Event = {
        ...context,
        time: new Date().getTime(),
        app_version: this.config.appVersion,
        ...(this.config.trackingOptions.platform && { platform: BROWSER_PLATFORM }),
        ...(this.config.trackingOptions.osName && { os_name: osName }),
        ...(this.config.trackingOptions.osVersion && { os_version: osVersion }),
        ...(this.config.trackingOptions.deviceManufacturer && { device_manufacturer: deviceVendor }),
        ...(this.config.trackingOptions.deviceModel && { device_model: deviceModel }),
        ...(this.config.trackingOptions.language && { language: getLanguage() }),
        ...(this.config.trackingOptions.ipAddress && { ip: IP_ADDRESS }),
        event_id: this.eventId++,
        insert_id: UUID(),
      };
      return resolve(contextEvent);
    });
  }
}
