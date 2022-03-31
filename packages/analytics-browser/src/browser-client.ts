import {
  add as _add,
  groupIdentify as _groupIdentify,
  Destination,
  identify as _identify,
  revenue as _revenue,
  init as _init,
  setOptOut as _setOptOut,
  Identify,
  Revenue,
  track as _track,
  setGroup as _setGroup,
  remove as _remove,
} from '@amplitude/analytics-core';
import {
  AmplitudeReturn,
  BrowserConfig,
  BrowserOptions,
  EventOptions,
  Plugin,
  Result,
  TransportType,
} from '@amplitude/analytics-types';
import { convertProxyObjectToRealObject, isInstanceProxy } from './utils/snippet-helper';
import { Context } from './plugins/context';
import { createConfig, createTransport, getConfig } from './config';
import { trackAttributions } from './attribution';
import { updateCookies } from './session-manager';

/**
 * Initializes the Amplitude SDK with your apiKey, userId and optional configurations.
 * This method must be called before any other operations.
 *
 * ```typescript
 * await init(API_KEY, USER_ID, options).promise;
 * ```
 */
export const init = (apiKey: string, userId?: string, options?: BrowserOptions): AmplitudeReturn<void> => {
  return {
    promise: (async () => {
      const browserOptions = createConfig(apiKey, userId, options);
      const config = _init(browserOptions) as BrowserConfig;
      updateCookies(config);

      await _add(new Context());
      await _add(new Destination());
      trackAttributions(config);
    })(),
  };
};

/**
 * Adds a new plugin.
 *
 * ```typescript
 * const plugin = {...};
 * amplitude.add(plugin);
 * ```
 */
export const add = (plugin: Plugin): AmplitudeReturn<void> => {
  return {
    promise: _add(plugin),
  };
};

/**
 * Removes a plugin.
 *
 * ```typescript
 * amplitude.remove('myPlugin');
 * ```
 */
export const remove = (pluginName: string): AmplitudeReturn<void> => {
  return {
    promise: _remove(pluginName),
  };
};

/**
 * Returns current user ID.
 *
 * ```typescript
 * const userId = getUserId();
 * ```
 */
export const getUserId = () => {
  return getConfig().userId;
};

/**
 * Sets a new user ID.
 *
 * ```typescript
 * setUserId('userId');
 * ```
 */
export const setUserId = (userId: string) => {
  const config = getConfig();
  config.userId = userId;
  updateCookies(config);
};

/**
 * Returns current device ID.
 *
 * ```typescript
 * const deviceId = getDeviceId();
 * ```
 */
export const getDeviceId = () => {
  return getConfig().deviceId;
};

/**
 * Sets a new device ID.
 * When setting a custom device ID, make sure the value is sufficiently unique.
 * A uuid is recommended.
 *
 * ```typescript
 * setDeviceId('deviceId');
 * ```
 */
export const setDeviceId = (deviceId: string) => {
  const config = getConfig();
  config.deviceId = deviceId;
  updateCookies(config);
};

/**
 * Returns current session ID.
 *
 * ```typescript
 * const sessionId = getSessionId();
 * ```
 */
export const getSessionId = () => {
  return getConfig().sessionId;
};

/**
 * Sets a new session ID.
 * When settign a custom session ID, make sure the value is in milliseconds since epoch (Unix Timestamp).
 *
 * ```typescript
 * setSessionId(Date.now());
 * ```
 */
export const setSessionId = (sessionId: number) => {
  const config = getConfig();
  config.sessionId = sessionId;
  updateCookies(config);
};

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
export const setOptOut = (optOut: boolean) => {
  _setOptOut(optOut);
  const config = getConfig();
  updateCookies(config);
};

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
export const setTransport = (transport: TransportType) => {
  const config = getConfig();
  const transportProvider = createTransport(transport);
  config.transportProvider = transportProvider;
};

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
export const track = (
  eventType: string,
  eventProperties?: Record<string, any>,
  eventOptions?: EventOptions,
): AmplitudeReturn<Result> => {
  return {
    promise: _track(eventType, eventProperties, eventOptions),
  };
};

/**
 * Alis for track()
 */
export const logEvent = track;

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
export const identify = (identify: Identify, eventOptions?: EventOptions): AmplitudeReturn<Result> => {
  if (isInstanceProxy(identify)) {
    const queue = identify._q;
    identify._q = [];
    identify = convertProxyObjectToRealObject(new Identify(), queue);
  }
  return {
    promise: _identify(undefined, undefined, identify, eventOptions),
  };
};

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
export const groupIdentify = (
  groupType: string,
  groupName: string | string[],
  identify: Identify,
  eventOptions?: EventOptions,
): AmplitudeReturn<Result> => {
  if (isInstanceProxy(identify)) {
    const queue = identify._q;
    identify._q = [];
    identify = convertProxyObjectToRealObject(new Identify(), queue);
  }
  return {
    promise: _groupIdentify(undefined, undefined, groupType, groupName, identify, eventOptions),
  };
};

export const setGroup = (groupType: string, groupName: string | string[]): AmplitudeReturn<Result> => {
  return {
    promise: _setGroup(groupType, groupName),
  };
};

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
export const revenue = (revenue: Revenue, eventOptions?: EventOptions): AmplitudeReturn<Result> => {
  if (isInstanceProxy(revenue)) {
    const queue = revenue._q;
    revenue._q = [];
    revenue = convertProxyObjectToRealObject(new Revenue(), queue);
  }
  return {
    promise: _revenue(revenue, eventOptions),
  };
};
