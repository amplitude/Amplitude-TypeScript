import { add, Destination, init as _init, track as _track, setOptOut as _setOptOut } from '@amplitude/analytics-core';
import { BrowserConfig, BrowserOptions } from '@amplitude/analytics-types';
import { trackAttributions } from './attribution';
import { createConfig, getConfig } from './config';
import { Context } from './plugins/context';
import { updateCookies } from './session-manager';
import { Amplitude } from './typings/browser-snippet';

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

export const track = _track;

export const runQueuedFunctions = function (amplitudeInstance: Amplitude) {
  const queue = amplitudeInstance._q;
  amplitudeInstance._q = [];

  for (let i = 0; i < queue.length; i++) {
    const fn = amplitudeInstance[queue[i][0]];
    if (typeof fn === 'function') {
      fn.apply(amplitudeInstance, queue[i][1]);
    }
  }
};
