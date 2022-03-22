import {
  Config,
  Event,
  GroupIdentifyEvent,
  Identify,
  IdentifyEvent,
  Plugin,
  Revenue,
  RevenueEvent,
  TrackEvent,
} from '@amplitude/analytics-types';
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

export const track = (eventType: string, eventProperties?: Record<string, any>, eventOptions?: Partial<TrackEvent>) => {
  const config = getConfig();
  const event = createTrackEvent(eventType, eventProperties, eventOptions);
  return dispatch(event, config);
};
export const logEvent = track;

export const identify = (
  userId: string | undefined,
  deviceId: string | undefined,
  identify: Identify,
  eventOptions?: Partial<IdentifyEvent>,
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
  eventOptions?: Partial<GroupIdentifyEvent>,
) => {
  const config = getConfig();
  const event = createGroupIdentifyEvent(userId, deviceId, groupType, groupName, identify, eventOptions);
  return dispatch(event, config);
};

export const revenue = (revenue: Revenue, eventOptions?: Partial<RevenueEvent>) => {
  const config = getConfig();
  const event = createRevenueEvent(revenue, eventOptions);
  return dispatch(event, config);
};

export const add = async (plugin: Plugin) => {
  const config = getConfig();
  return register(plugin, config);
};

export const remove = async (pluginName: string) => {
  return deregister(pluginName);
};

export const dispatch = async (event: Event, config: Config) => {
  try {
    return push(event, config);
  } catch (_) {
    return buildResult();
  }
};
