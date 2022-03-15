import { BeforePlugin, BrowserConfig, Event, PluginType, TrackingOptions } from '@amplitude/analytics-types';

import UAParser from '@amplitude/ua-parser-js';
import { UUID } from '../utils/uuid';
import { getLanguage } from '../utils/language';

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
        ...(this.trackingOptions.platform && { platform: 'Web' }),
        ...(this.trackingOptions.os_name && { os_name: osName }),
        ...(this.trackingOptions.os_version && { os_version: osVersion }),
        ...(this.trackingOptions.device_manufacturer && { device_manufacturer: deviceVendor }),
        ...(this.trackingOptions.device_model && { device_model: deviceModel }),
        ...(this.trackingOptions.language && { language: getLanguage() }),
        ...(this.trackingOptions.ip_address && { ip: '$remote' }),
        event_id: this.eventId++,
        insert_id: UUID(),
      };
      return resolve(contextEvent);
    });
  }
}
