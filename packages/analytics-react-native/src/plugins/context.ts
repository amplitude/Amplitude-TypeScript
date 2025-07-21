import { BeforePlugin, ReactNativeConfig, Event, ReactNativeTrackingOptions, UUID } from '@amplitude/analytics-core';
import UAParser from '@amplitude/ua-parser-js';
import { getLanguage } from '@amplitude/analytics-client-common';
import { VERSION } from '../version';
import { NativeModules } from 'react-native';

const BROWSER_PLATFORM = 'Web';
const IP_ADDRESS = '$remote';

type NativeContext = {
  version: string;
  platform: string;
  language: string;
  country: string;
  osName: string;
  osVersion: string;
  deviceBrand: string;
  deviceManufacturer: string;
  deviceModel: string;
  carrier: string;
  adid: string;
  appSetId: string;
  idfv: string;
};

export interface AmplitudeReactNative {
  getApplicationContext(options: ReactNativeTrackingOptions): Promise<NativeContext>;
}

export class Context implements BeforePlugin {
  name = 'context';
  type = 'before' as const;

  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: ReactNativeConfig;
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.uaResult = new UAParser(agent).getResult();
  }

  setup(config: ReactNativeConfig): Promise<undefined> {
    this.config = config;
    return Promise.resolve(undefined);
  }

  async execute(context: Event): Promise<Event> {
    const time = new Date().getTime();
    const nativeContext = await this.nativeModule?.getApplicationContext(this.config.trackingOptions);
    const appVersion = this.config.appVersion || nativeContext?.version;
    const platform = nativeContext?.platform || BROWSER_PLATFORM;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const osName = nativeContext?.osName || this.uaResult.browser.name;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const osVersion = nativeContext?.osVersion || this.uaResult.browser.version;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const deviceVendor = nativeContext?.deviceManufacturer || this.uaResult.device.vendor;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const deviceModel = nativeContext?.deviceModel || this.uaResult.device.model || this.uaResult.os.name;
    const language = nativeContext?.language || getLanguage();
    const country = nativeContext?.country;
    const carrier = nativeContext?.carrier;
    const adid = nativeContext?.adid;
    const appSetId = nativeContext?.appSetId;
    const idfv = nativeContext?.idfv;

    const event: Event = {
      user_id: this.config.userId,
      device_id: this.config.deviceId,
      session_id: this.config.sessionId,
      time,
      ...(appVersion && { app_version: appVersion }),
      ...(this.config.trackingOptions.platform && { platform: platform }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      ...(this.config.trackingOptions.osName && { os_name: osName }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      ...(this.config.trackingOptions.osVersion && { os_version: osVersion }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      ...(this.config.trackingOptions.deviceManufacturer && { device_manufacturer: deviceVendor }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      ...(this.config.trackingOptions.deviceModel && { device_model: deviceModel }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      ...(this.config.trackingOptions.language && { language: language }),
      ...(this.config.trackingOptions.country && { country: country }),
      ...(this.config.trackingOptions.carrier && { carrier: carrier }),
      ...(this.config.trackingOptions.ipAddress && { ip: IP_ADDRESS }),
      ...(this.config.trackingOptions.adid && { adid: adid }),
      ...(this.config.trackingOptions.appSetId && { android_app_set_id: appSetId }),
      ...(this.config.trackingOptions.idfv && { idfv: idfv }),
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
      library: this.library,
    };
    return event;
  }
}
