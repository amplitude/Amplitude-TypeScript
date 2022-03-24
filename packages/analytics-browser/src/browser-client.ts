import {
  add,
  groupIdentify as _groupIdentify,
  Destination,
  identify as _identify,
  init as _init,
  setOptOut as _setOptOut,
} from '@amplitude/analytics-core';
import { BrowserConfig, BrowserOptions, EventOptions, Identify } from '@amplitude/analytics-types';
import { trackAttributions } from './attribution';
import { createConfig, getConfig } from './config';
import { Context } from './plugins/context';
import { updateCookies } from './session-manager';

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

export const identify = (identify: Identify, eventOptions?: EventOptions) => {
  return _identify(undefined, undefined, identify, eventOptions);
};

export const groupIdentify = (
  groupType: string,
  groupName: string | string[],
  identify: Identify,
  eventOptions?: EventOptions,
) => {
  return _groupIdentify(undefined, undefined, groupType, groupName, identify, eventOptions);
};
