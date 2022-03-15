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

export const identify = (identify: Identify, userId?: string, deviceId?: string) => {
  const config = getConfig();
  const event = createIdentifyEvent(identify, userId, deviceId);
  return dispatch(event, config);
};

export const groupIdentify = () => {
  const config = getConfig();
  const event = createGroupIdentifyEvent();
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
