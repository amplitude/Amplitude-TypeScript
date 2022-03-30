import { Config, Event, EventOptions, Identify, Plugin, Revenue } from '@amplitude/analytics-types';
import { createConfig, getConfig } from './config';
import {
  createGroupIdentifyEvent,
  createIdentifyEvent,
  createTrackEvent,
  createRevenueEvent,
  createGroupEvent,
} from './utils/event-builder';
import { deregister, push, register } from './timeline';
import { buildResult } from './utils/result-builder';

export const init = (config: Config) => {
  return createConfig(config);
};

export const track = (eventType: string, eventProperties?: Record<string, any>, eventOptions?: EventOptions) => {
  const config = getConfig();
  const event = createTrackEvent(eventType, eventProperties, eventOptions);
  return dispatch(event, config);
};
export const logEvent = track;

export const identify = (
  userId: string | undefined,
  deviceId: string | undefined,
  identify: Identify,
  eventOptions?: EventOptions,
) => {
  const config = getConfig();
  const event = createIdentifyEvent(userId, deviceId, identify, eventOptions);
  return dispatch(event, config);
};

export const groupIdentify = (
  userId: string | undefined,
  deviceId: string | undefined,
  groupType: string,
  groupName: string | string[],
  identify: Identify,
  eventOptions?: EventOptions,
) => {
  const config = getConfig();
  const event = createGroupIdentifyEvent(userId, deviceId, groupType, groupName, identify, eventOptions);
  return dispatch(event, config);
};

export const setGroup = (groupType: string, groupName: string | string[]) => {
  const config = getConfig();
  const event = createGroupEvent(groupType, groupName);
  return dispatch(event, config);
};

export const revenue = (revenue: Revenue, eventOptions?: EventOptions) => {
  const config = getConfig();
  const event = createRevenueEvent(revenue, eventOptions);
  return dispatch(event, config);
};

export const add = async (plugin: Plugin) => {
  const config = getConfig();
  return register(plugin, config);
};

export const remove = async (pluginName: string) => {
  const config = getConfig();
  return deregister(pluginName, config);
};

export const dispatch = async (event: Event, config: Config) => {
  try {
    const result = await push(event, config);
    if (result.code === 200) {
      config.loggerProvider.log(result.message);
    } else {
      config.loggerProvider.error(result.message);
    }
    return result;
  } catch (e) {
    const message = String(e);
    config.loggerProvider.error(message);
    return buildResult(event, 0, message);
  }
};

export const setOptOut = (optOut: boolean) => {
  const config = getConfig();
  config.optOut = Boolean(optOut);
};
