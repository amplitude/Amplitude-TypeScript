import { BeforePlugin, Config, Event, PluginType } from '@amplitude/analytics-types';

import UAParser from '@amplitude/ua-parser-js';
import UUID from '../utils/uuid';
import { getLanguage } from '../utils/language';

export class Context implements BeforePlugin {
  name: string;
  type = PluginType.BEFORE as const;

  appVersion: string;
  eventId: number;
  uaResult: UAParser.IResult;

  constructor(name: string) {
    this.name = name;
  }

  setup(config: Config): Promise<undefined> {
    this.appVersion = config.version || '';
    this.eventId = 0;
    this.uaResult = new UAParser(navigator.userAgent).getResult();
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
        platform: 'Web',
        os_name: osName,
        os_version: osVersion,
        device_manufacturer: deviceVendor,
        device_model: deviceModel,
        language: getLanguage(),
        ip: '$remote',
        event_id: this.eventId++,
        insert_id: UUID(),
      };
      return resolve(contextEvent);
    });
  }
}
