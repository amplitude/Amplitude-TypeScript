import { BeforePlugin, BrowserConfig, Event, PluginType } from '@amplitude/analytics-types';
import UAParser from '@amplitude/ua-parser-js';
import { UUID } from '@amplitude/analytics-core';
import { getLanguage } from '@amplitude/analytics-client-common';
import { VERSION } from '../version';

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
  library = `amplitude-ts/${VERSION}`;

  constructor() {
    let agent: string | undefined;
    /* istanbul ignore else */
    if (typeof navigator !== 'undefined') {
      agent = navigator.userAgent;
    }
    this.uaResult = new UAParser(agent).getResult();
  }

  setup(config: BrowserConfig): Promise<undefined> {
    this.config = config;

    return Promise.resolve(undefined);
  }

  async execute(context: Event): Promise<Event> {
    /**
     * Manages user session triggered by new events
     */
    if (!this.isSessionValid()) {
      // Creates new session
      this.config.sessionId = Date.now();
    } // else use previously creates session
    // Updates last event time to extend time-based session
    this.config.lastEventTime = Date.now();
    const time = new Date().getTime();
    const osName = this.uaResult.browser.name;
    const osVersion = this.uaResult.browser.version;
    const deviceModel = this.uaResult.device.model || this.uaResult.os.name;
    const deviceVendor = this.uaResult.device.vendor;

    const event: Event = {
      user_id: this.config.userId,
      device_id: this.config.deviceId,
      session_id: this.config.sessionId,
      time,
      ...(this.config.appVersion && { app_version: this.config.appVersion }),
      ...(this.config.trackingOptions.platform && { platform: BROWSER_PLATFORM }),
      ...(this.config.trackingOptions.osName && { os_name: osName }),
      ...(this.config.trackingOptions.osVersion && { os_version: osVersion }),
      ...(this.config.trackingOptions.deviceManufacturer && { device_manufacturer: deviceVendor }),
      ...(this.config.trackingOptions.deviceModel && { device_model: deviceModel }),
      ...(this.config.trackingOptions.language && { language: getLanguage() }),
      ...(this.config.trackingOptions.ipAddress && { ip: IP_ADDRESS }),
      insert_id: UUID(),
      partner_id: this.config.partnerId,
      plan: this.config.plan,
      ...(this.config.ingestionMetadata && {
        ingestion_metadata: {
          source_name: this.config.ingestionMetadata.sourceName,
          source_version: this.config.ingestionMetadata.sourceVersion,
        },
      }),
      ...context,
      event_id: this.eventId++,
      library: this.library,
    };
    return event;
  }

  isSessionValid() {
    const lastEventTime = this.config.lastEventTime || Date.now();
    const timeSinceLastEvent = Date.now() - lastEventTime;
    return timeSinceLastEvent < this.config.sessionTimeout;
  }
}
