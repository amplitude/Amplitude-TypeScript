import {
  add,
  groupIdentify as _groupIdentify,
  Destination,
  identify as _identify,
  revenue as _revenue,
  init as _init,
  setOptOut as _setOptOut,
  Identify,
  Revenue,
} from '@amplitude/analytics-core';
import { BrowserConfig, BrowserOptions, EventOptions } from '@amplitude/analytics-types';
import { convertProxyObjectToRealObject, isSnippetProxy } from './utils/snippet-helper';
import { Context } from './plugins/context';
import { createConfig, getConfig } from './config';
import { SnippetProxy } from './typings/browser-snippet';
import { trackAttributions } from './attribution';
import { updateCookies } from './session-manager';

/**
 * Initializes the Amplitude SDK with your apiKey, userId and optional configurations.
 * This method must be called before any other operations.
 * ```typescript
 * await init(API_KEY, USER_ID, {});
 * ```
 */
export const init = async (apiKey: string, userId?: string, options?: BrowserOptions) => {
  const browserOptions = createConfig(apiKey, userId, options);
  const config = _init(browserOptions) as BrowserConfig;
  updateCookies(config);

  await add(new Context());
  await add(new Destination());
  trackAttributions(config);
};

/**
 * Returns current user id
 * ```typescript
 * const userId = getUserId();
 * ```
 */
export const getUserId = () => {
  return getConfig().userId;
};

/**
 * Sets a new user id
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
 * Returns current device id
 * ```typescript
 * const deviceId = getDeviceId();
 * ```
 */
export const getDeviceId = () => {
  return getConfig().deviceId;
};

/**
 * Sets a new device id
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
 * Returns current session id
 * ```typescript
 * const sessionId = getSessionId();
 * ```
 */
export const getSessionId = () => {
  return getConfig().sessionId;
};

/**
 * Sets a new session id
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
 * Sets a new optOut config value. This config value toggles event tracking on/off.
 *```typescript
 * // To stop tracking
 * setOptOut(true);
 * // To start/resume tracking
 * setOptOut(false);
 * ```
 */
export const setOptOut = (optOut: boolean) => {
  _setOptOut(optOut);
  const config = getConfig();
  updateCookies(config);
};

/**
 * Sends an identify call containing user property operations
 * ```typescript
 * const id = new Identify();
 * id.set('colors', ['rose', 'gold']);
 * await identify(id);
 * ```
 */
export const identify = (identify: Identify | SnippetProxy, eventOptions?: EventOptions) => {
  if (isSnippetProxy(identify)) {
    identify = convertProxyObjectToRealObject(new Identify(), identify);
  }
  return _identify(undefined, undefined, identify, eventOptions);
};

/**
 * Sends a group identify call containing group property operations
 * ```typescript
 * const id = new Identify();
 * id.set('colors', ['rose', 'gold']);
 * const groupType = 'org';
 * const groupName = 'engineering';
 * await groupIdentify(groupType, groupName, id);
 * ```
 */
export const groupIdentify = (
  groupType: string,
  groupName: string | string[],
  identify: Identify | SnippetProxy,
  eventOptions?: EventOptions,
) => {
  if (isSnippetProxy(identify)) {
    identify = convertProxyObjectToRealObject(new Identify(), identify);
  }
  return _groupIdentify(undefined, undefined, groupType, groupName, identify, eventOptions);
};

/**
 * Sends a revenue call containing revenue property operations
 * ```typescript
 * const rev = new Revenue();
 * rev.setRevenue(100);
 * await revenue(rev);
 * ```
 */
export const revenue = (revenue: Revenue | SnippetProxy, eventOptions?: EventOptions) => {
  if (isSnippetProxy(revenue)) {
    revenue = convertProxyObjectToRealObject(new Revenue(), revenue);
  }
  return _revenue(revenue, eventOptions);
};
