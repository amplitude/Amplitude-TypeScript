import { AmplitudeCore, Destination, Identify, Revenue, returnWrapper } from '@amplitude/analytics-core';
import {
  BrowserConfig,
  BrowserOptions,
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

const client = new AmplitudeBrowser();

/**
 * Initializes the Amplitude SDK with your apiKey, userId and optional configurations.
 * This method must be called before any other operations.
 *
 * ```typescript
 * await init(API_KEY, USER_ID, options).promise;
 * ```
 */
export const init = returnWrapper(client.init.bind(client));

/**
 * Adds a new plugin.
 *
 * ```typescript
 * const plugin = {...};
 * amplitude.add(plugin);
 * ```
 */
export const add = returnWrapper(client.add.bind(client));

/**
 * Removes a plugin.
 *
 * ```typescript
 * amplitude.remove('myPlugin');
 * ```
 */
export const remove = returnWrapper(client.remove.bind(client));

/**
 * Tracks user-defined event, with specified type, optional event properties and optional overwrites.
 *
 * ```typescript
 * // event tracking with event type only
 * track('Page Load');
 *
 * // event tracking with event type and additional event properties
 * track('Page Load', { loadTime: 1000 });
 *
 * // event tracking with event type, additional event properties, and overwritten event options
 * track('Page Load', { loadTime: 1000 }, { sessionId: -1 });
 *
 * // alternatively, this tracking method is awaitable
 * const result = await track('Page Load').promise;
 * console.log(result.event); // {...}
 * console.log(result.code); // 200
 * console.log(result.message); // "Event tracked successfully"
 * ```
 */
export const track = returnWrapper(client.track.bind(client));

/**
 * Alias for track()
 */
export const logEvent = returnWrapper(client.logEvent.bind(client));

/**
 * Sends an identify event containing user property operations
 *
 * ```typescript
 * const id = new Identify();
 * id.set('colors', ['rose', 'gold']);
 * identify(id);
 *
 * // alternatively, this tracking method is awaitable
 * const result = await identify(id).promise;
 * console.log(result.event); // {...}
 * console.log(result.code); // 200
 * console.log(result.message); // "Event tracked successfully"
 * ```
 */
export const identify = returnWrapper(client.identify.bind(client));

/**
 * Sends a group identify event containing group property operations.
 *
 * ```typescript
 * const id = new Identify();
 * id.set('skills', ['js', 'ts']);
 * const groupType = 'org';
 * const groupName = 'engineering';
 * groupIdentify(groupType, groupName, id);
 *
 * // alternatively, this tracking method is awaitable
 * const result = await groupIdentify(groupType, groupName, id).promise;
 * console.log(result.event); // {...}
 * console.log(result.code); // 200
 * console.log(result.message); // "Event tracked successfully"
 * ```
 */
export const groupIdentify = returnWrapper(client.groupIdentify.bind(client));
export const setGroup = returnWrapper(client.setGroup.bind(client));

/**
 * Sends a revenue event containing revenue property operations.
 *
 * ```typescript
 * const rev = new Revenue();
 * rev.setRevenue(100);
 * revenue(rev);
 *
 * // alternatively, this tracking method is awaitable
 * const result = await revenue(rev).promise;
 * console.log(result.event); // {...}
 * console.log(result.code); // 200
 * console.log(result.message); // "Event tracked successfully"
 * ```
 */
export const revenue = returnWrapper(client.revenue.bind(client));

/**
 * Returns current user ID.
 *
 * ```typescript
 * const userId = getUserId();
 * ```
 */
export const getUserId = client.getUserId.bind(client);

/**
 * Sets a new user ID.
 *
 * ```typescript
 * setUserId('userId');
 * ```
 */
export const setUserId = client.setUserId.bind(client);

/**
 * Returns current device ID.
 *
 * ```typescript
 * const deviceId = getDeviceId();
 * ```
 */
export const getDeviceId = client.getDeviceId.bind(client);

/**
 * Sets a new device ID.
 * When setting a custom device ID, make sure the value is sufficiently unique.
 * A uuid is recommended.
 *
 * ```typescript
 * setDeviceId('deviceId');
 * ```
 */
export const setDeviceId = client.setDeviceId.bind(client);

/**
 * Returns current session ID.
 *
 * ```typescript
 * const sessionId = getSessionId();
 * ```
 */
export const getSessionId = client.getSessionId.bind(client);

/**
 * Sets a new session ID.
 * When settign a custom session ID, make sure the value is in milliseconds since epoch (Unix Timestamp).
 *
 * ```typescript
 * setSessionId(Date.now());
 * ```
 */
export const setSessionId = client.setSessionId.bind(client);

/**
 * Sets a new optOut config value. This toggles event tracking on/off.
 *
 *```typescript
 * // Stops tracking
 * setOptOut(true);
 *
 * // Starts/resumes tracking
 * setOptOut(false);
 * ```
 */
export const setOptOut = client.setOptOut.bind(client);

/**
 *  Sets the network transport type for events.
 *
 * ```typescript
 * // Use Fetch API
 * setTransport('fetch');
 *
 * // Use XMLHttpRequest API
 * setTransport('xhr');
 *
 * // Use navigator.sendBeacon API
 * setTransport('beacon');
 * ```
 */
export const setTransport = client.setTransport.bind(client);
