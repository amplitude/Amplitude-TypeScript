import { BeforePlugin, ReactNativeConfig, Event, PluginType } from '@amplitude/analytics-types';
import UAParser from '@amplitude/ua-parser-js';
import { UUID } from '@amplitude/analytics-core';
import { getLanguage } from '../utils/language';
import { VERSION } from '../version';
import { NativeModules } from 'react-native';

const BROWSER_PLATFORM = 'Web';
const IP_ADDRESS = '$remote';

type NativeContext = {
  version: string;
  platform: string;
  language: string;
  osName: string;
  osVersion: string;
  deviceBrand: string;
  deviceManufacturer: string;
  deviceModel: string;
  carrier: string;
  adid: string;
};

export interface AmplitudeReactNative {
  getApplicationContext(): Promise<NativeContext>;
}

export class Context implements BeforePlugin {
  name = 'context';
  type = PluginType.BEFORE as const;

  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: ReactNativeConfig;
  eventId = 0;
  uaResult: UAParser.IResult;
  nativeModule: AmplitudeReactNative | undefined = NativeModules.AmplitudeReactNative as
    | AmplitudeReactNative
    | undefined;
  library = `amplitude-react-native-ts/${VERSION}`;

  constructor() {
    let agent: string | undefined;
    /* istanbul ignore else */
    if (typeof navigator !== 'undefined') {
      agent = navigator.userAgent;
    }
    this.uaResult = new UAParser(agent).getResult();
  }

  setup(config: ReactNativeConfig): Promise<undefined> {
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
    const nativeContext = await this.nativeModule?.getApplicationContext();
    const appVersion = nativeContext?.version || this.config.appVersion;
    const platform = nativeContext?.platform || BROWSER_PLATFORM;
    const osName = nativeContext?.osName || this.uaResult.browser.name;
    const osVersion = nativeContext?.osVersion || this.uaResult.browser.version;
    const deviceVendor = nativeContext?.deviceManufacturer || this.uaResult.device.vendor;
    const deviceModel = nativeContext?.deviceModel || this.uaResult.device.model || this.uaResult.os.name;
    const language = nativeContext?.language || getLanguage();
    const carrier = nativeContext?.carrier;
    const adid = nativeContext?.adid;

    const event: Event = {
      user_id: this.config.userId,
      device_id: this.config.deviceId,
      session_id: this.config.sessionId,
      time,
      ...(this.config.appVersion && { app_version: appVersion }),
      ...(this.config.trackingOptions.platform && { platform: platform }),
      ...(this.config.trackingOptions.osName && { os_name: osName }),
      ...(this.config.trackingOptions.osVersion && { os_version: osVersion }),
      ...(this.config.trackingOptions.deviceManufacturer && { device_manufacturer: deviceVendor }),
      ...(this.config.trackingOptions.deviceModel && { device_model: deviceModel }),
      ...(this.config.trackingOptions.language && { language: language }),
      ...(this.config.trackingOptions.carrier && { carrier: carrier }),
      ...(this.config.trackingOptions.ipAddress && { ip: IP_ADDRESS }),
      ...(this.config.trackingOptions.adid && { adid: adid }),
      insert_id: UUID(),
      partner_id: this.config.partnerId,
      plan: this.config.plan,
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
