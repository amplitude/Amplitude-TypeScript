import { BeforePlugin, BrowserConfig, Event, PluginType, TrackingOptions } from '@amplitude/analytics-types';

import UAParser from '@amplitude/ua-parser-js';
import { UUID } from '../utils/uuid';
import { getLanguage } from '../utils/language';

const BROWSER_PLATFORM = 'Web';
const IP_ADDRESS = '$remote';

export class Context implements BeforePlugin {
  name: string;
  type = PluginType.BEFORE as const;

  appVersion = '';
  eventId = 0;
  uaResult: UAParser.IResult;

  private trackingOptions: TrackingOptions = {};

  constructor(name: string) {
    this.name = name;
    this.uaResult = new UAParser(navigator.userAgent).getResult();
  }

  setup(config: BrowserConfig): Promise<undefined> {
    this.appVersion = config.appVersion ?? '';
    this.trackingOptions = config.trackingOptions;
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
        app_version: this.appVersion,
        ...(this.trackingOptions.platform && { platform: BROWSER_PLATFORM }),
        ...(this.trackingOptions.osName && { os_name: osName }),
        ...(this.trackingOptions.osVersion && { os_version: osVersion }),
        ...(this.trackingOptions.deviceManufacturer && { device_manufacturer: deviceVendor }),
        ...(this.trackingOptions.deviceModel && { device_model: deviceModel }),
        ...(this.trackingOptions.language && { language: getLanguage() }),
        ...(this.trackingOptions.ipAddress && { ip: IP_ADDRESS }),
        event_id: this.eventId++,
        insert_id: UUID(),
      };
      return resolve(contextEvent);
    });
  }
}
