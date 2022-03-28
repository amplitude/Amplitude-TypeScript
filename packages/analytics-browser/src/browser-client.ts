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
import { trackAttributions } from './attribution';
import { createConfig, getConfig } from './config';
import { Context } from './plugins/context';
import { updateCookies } from './session-manager';
import { AmplitudeProxy, AmplitudeType, SnippetProxy } from './typings/browser-snippet';

export const init = (apiKey: string, userId?: string, options?: BrowserOptions) => {
  const browserOptions = createConfig(apiKey, userId, options);
  const config = _init(browserOptions) as BrowserConfig;
  updateCookies(config);

  void add(new Context());
  void add(new Destination());
  trackAttributions(config);
};

export const setUserId = (userId: string) => {
  const config = getConfig();
  config.userId = userId;
  updateCookies(config);
};

export const setDeviceId = (deviceId: string) => {
  const config = getConfig();
  config.deviceId = deviceId;
  updateCookies(config);
};

export const setSessionId = (sessionId: number) => {
  const config = getConfig();
  config.sessionId = sessionId;
  updateCookies(config);
};

export const setOptOut = (optOut: boolean) => {
  _setOptOut(optOut);
  const config = getConfig();
  updateCookies(config);
};

export const identify = (identify: Identify | SnippetProxy, eventOptions?: EventOptions) => {
  if (hasOwnProxyProperty(identify)) {
    identify = <Identify>convertProxyObjectToRealObject(new Identify(), <SnippetProxy>identify);
  }
  return _identify(undefined, undefined, <Identify>identify, eventOptions);
};

export const groupIdentify = (
  groupType: string,
  groupName: string | string[],
  identify: Identify | SnippetProxy,
  eventOptions?: EventOptions,
) => {
  if (hasOwnProxyProperty(identify)) {
    identify = <Identify>convertProxyObjectToRealObject(new Identify(), <SnippetProxy>identify);
  }
  return _groupIdentify(undefined, undefined, groupType, groupName, <Identify>identify, eventOptions);
};

export const revenue = (revenue: Revenue | SnippetProxy, eventOptions?: EventOptions) => {
  if (hasOwnProxyProperty(revenue)) {
    revenue = <Revenue>convertProxyObjectToRealObject(new Revenue(), <SnippetProxy>revenue);
  }
  return _revenue(<Revenue>revenue, eventOptions);
};

export const runQueuedFunctions = (amplitudeProxy: AmplitudeProxy) => {
  convertProxyObjectToRealObject(window.amplitude as AmplitudeType, amplitudeProxy);
};

/**
 * Applies the proxied functions on the proxied object to an instance of the real object.
 * Used to convert proxied Identify and Revenue objects.
 */
const convertProxyObjectToRealObject = <T>(instance: T, proxy: SnippetProxy): T => {
  const queue = proxy._q;
  proxy._q = [];

  for (let i = 0; i < queue.length; i++) {
    const [functionName, ...args] = queue[i];
    const fn = (<Record<string, (...args: any) => unknown>>instance)[functionName];
    if (typeof fn === 'function') {
      fn.apply(instance, args);
    }
  }
  return instance;
};

const hasOwnProxyProperty = (snippetProxy: object) => {
  return typeof snippetProxy === 'object' && Object.prototype.hasOwnProperty.call(snippetProxy, '_q');
};
