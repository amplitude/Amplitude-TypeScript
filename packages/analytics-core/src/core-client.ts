import { Event, Plugin, Config, Identify, Revenue } from '@amplitude/analytics-types';
import { createConfig, getConfig } from './config';
import {
  createGroupIdentifyEvent,
  createIdentifyEvent,
  createTrackEvent,
  createRevenueEvent,
} from './utils/event-builder';
import { deregister, push, register } from './timeline';
import { buildResult } from './utils/result-builder';

export const init = (config: Config) => {
  return createConfig(config);
};

export const track = (eventType: string) => {
  const config = getConfig();
  const event = createTrackEvent(eventType);
  return dispatch(event, config);
};
export const logEvent = track;

export const identify = (userId: string | undefined, deviceId: string | undefined, identify: Identify) => {
  const config = getConfig();
  const event = createIdentifyEvent(userId, deviceId, identify);
  return dispatch(event, config);
};

export const groupIdentify = (
  userId: string | undefined,
  deviceId: string | undefined,
  groupType: string,
  groupName: string | string[],
  identify: Identify,
) => {
  const config = getConfig();
  const event = createGroupIdentifyEvent(userId, deviceId, groupType, groupName, identify);
  return dispatch(event, config);
};

export const revenue = (revenue: Revenue) => {
  const config = getConfig();
  const event = createRevenueEvent(revenue);
  return dispatch(event, config);
};

export const add = async (plugins: Plugin[]) => {
  const config = getConfig();
  const registrations = plugins.map((plugin) => register(plugin, config));
  await Promise.all(registrations);
};

export const remove = async (pluginNames: string[]) => {
  const deregistrations = pluginNames.map((name) => deregister(name));
  await Promise.all(deregistrations);
};

export const dispatch = async (event: Event, config: Config) => {
  try {
    return push(event, config);
  } catch (_) {
    return buildResult();
  }
};
