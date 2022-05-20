import { AmplitudeCore, Destination, Identify, Revenue, returnWrapper } from '@amplitude/analytics-core';
import {
  BrowserConfig,
  BrowserOptions,
  CreateBrowserInstance,
  EventOptions,
  Identify as IIdentify,
  Result,
  Revenue as IRevenue,
  TransportType,
} from '@amplitude/analytics-types';
import { convertProxyObjectToRealObject, isInstanceProxy } from './utils/snippet-helper';
import { Context } from './plugins/context';
import { useBrowserConfig, createTransport } from './config';
import { getAttributions } from './attribution';
import { updateCookies } from './session-manager';
import { parseOldCookies } from './cookie-migration';

export class AmplitudeBrowser extends AmplitudeCore<BrowserConfig> {
  async init(apiKey: string, userId?: string, options?: BrowserOptions) {
    // Step 1: Read cookies stored by old SDK
    const oldCookies = parseOldCookies(apiKey, options);

    // Step 2: Create browser config
    const browserOptions = useBrowserConfig(apiKey, userId || oldCookies.userId, {
      ...options,
      deviceId: oldCookies.deviceId ?? options?.deviceId,
      sessionId: oldCookies.sessionId ?? options?.sessionId,
      optOut: options?.optOut ?? oldCookies.optOut,
    });
    await super.init(undefined, undefined, browserOptions);

    // Step 3: Store user session in cookie storage
    updateCookies(this.config, oldCookies.lastEventTime);

    // Step 4: Install plugins
    await this.add(new Context());
    await this.add(new Destination());

    // Step 4: Track attributions
    void this.trackAttributions();
  }

  getUserId() {
    return this.config.userId;
  }

  setUserId(userId: string) {
    this.config.userId = userId;
    updateCookies(this.config);
  }

  getDeviceId() {
    return this.config.deviceId;
  }

  setDeviceId(deviceId: string) {
    this.config.deviceId = deviceId;
    updateCookies(this.config);
  }

  getSessionId() {
    return this.config.sessionId;
  }

  setSessionId(sessionId: number) {
    this.config.sessionId = sessionId;
    updateCookies(this.config);
  }

  setOptOut(optOut: boolean) {
    super.setOptOut(optOut);
    updateCookies(this.config);
  }

  setTransport(transport: TransportType) {
    this.config.transportProvider = createTransport(transport);
  }

  identify(identify: IIdentify, eventOptions?: EventOptions): Promise<Result> {
    if (isInstanceProxy(identify)) {
      const queue = identify._q;
      identify._q = [];
      identify = convertProxyObjectToRealObject(new Identify(), queue);
    }
    return super.identify(identify, eventOptions);
  }

  groupIdentify(
    groupType: string,
    groupName: string | string[],
    identify: IIdentify,
    eventOptions?: EventOptions,
  ): Promise<Result> {
    if (isInstanceProxy(identify)) {
      const queue = identify._q;
      identify._q = [];
      identify = convertProxyObjectToRealObject(new Identify(), queue);
    }
    return super.groupIdentify(groupType, groupName, identify, eventOptions);
  }

  revenue(revenue: IRevenue, eventOptions?: EventOptions) {
    if (isInstanceProxy(revenue)) {
      const queue = revenue._q;
      revenue._q = [];
      revenue = convertProxyObjectToRealObject(new Revenue(), queue);
    }
    return super.revenue(revenue, eventOptions);
  }

  trackAttributions() {
    const attributions = getAttributions(this.config);
    if (Object.keys(attributions).length === 0) {
      return;
    }
    const id = new Identify();
    Object.entries(attributions).forEach(([key, value]: [string, string]) => {
      if (value) {
        id.setOnce(`initial_${key}`, value);
        id.set(key, value);
      }
    });
    return this.identify(id);
  }
}

/**
 * > EXPERIMENTAL
 *
 * Creates additional Amplitude instance. This can be used to instantiate
 * a new tracker with a different `API_KEY` and configuration.
 *
 * ```typescript
 * const amp2 = createInstance('amp-2');
 * await amp2.init(API_KEY_2, '', options).promise;
 * ```
 */
export const createInstance: CreateBrowserInstance = (instanceName: string) => {
  const instance = new AmplitudeBrowser(instanceName);
  return {
    init: returnWrapper(instance.init.bind(instance)),
    add: returnWrapper(instance.add.bind(instance)),
    remove: returnWrapper(instance.remove.bind(instance)),
    track: returnWrapper(instance.track.bind(instance)),
    logEvent: returnWrapper(instance.logEvent.bind(instance)),
    identify: returnWrapper(instance.identify.bind(instance)),
    groupIdentify: returnWrapper(instance.groupIdentify.bind(instance)),
    setGroup: returnWrapper(instance.setGroup.bind(instance)),
    revenue: returnWrapper(instance.revenue.bind(instance)),
    getUserId: instance.getUserId.bind(instance),
    setUserId: instance.setUserId.bind(instance),
    getDeviceId: instance.getDeviceId.bind(instance),
    setDeviceId: instance.setDeviceId.bind(instance),
    getSessionId: instance.getSessionId.bind(instance),
    setSessionId: instance.setSessionId.bind(instance),
    setOptOut: instance.setOptOut.bind(instance),
    setTransport: instance.setTransport.bind(instance),
  };
};

export default createInstance('$default');
