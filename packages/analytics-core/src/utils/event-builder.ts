import {
  TrackEvent,
  IdentifyEvent,
  GroupIdentifyEvent,
  SpecialEventType,
  Identify as IIdentify,
  Revenue,
  RevenueEvent,
  EventOptions,
} from '@amplitude/analytics-types';
import { Identify } from '../identify';

export const createTrackEvent = (
  eventType: string,
  eventProperties?: Record<string, any>,
  eventOptions?: EventOptions,
): TrackEvent => {
  return {
    ...eventOptions,
    event_type: eventType,
    ...(eventProperties && { event_properties: eventProperties }),
  };
};

export const createIdentifyEvent = (
  userId: string | undefined,
  deviceId: string | undefined,
  identify: IIdentify,
  eventOptions?: EventOptions,
): IdentifyEvent => {
  const identifyEvent: IdentifyEvent = {
    ...eventOptions,
    event_type: SpecialEventType.IDENTIFY,
    user_properties: identify.getUserProperties(),
    user_id: userId,
  };

  if (deviceId !== undefined && deviceId.length > 0) {
    identifyEvent.device_id = deviceId;
  }

  return identifyEvent;
};

export const createGroupIdentifyEvent = (
  userId: string | undefined,
  deviceId: string | undefined,
  groupType: string,
  groupName: string | string[],
  identify: IIdentify,
  eventOptions?: EventOptions,
): GroupIdentifyEvent => {
  const groupIdentify: GroupIdentifyEvent = {
    ...eventOptions,
    event_type: SpecialEventType.GROUP_IDENTIFY,
    group_properties: identify.getUserProperties(),
    groups: {
      [groupType]: groupName,
    },
    user_id: userId,
  };

  if (deviceId !== undefined && deviceId.length > 0) {
    groupIdentify.device_id = deviceId;
  }

  return groupIdentify;
};

export const createGroupEvent = (groupType: string, groupName: string | string[]) => {
  const identify = new Identify();
  identify.set(groupType, groupName);

  const groupEvent: IdentifyEvent = {
    event_type: SpecialEventType.IDENTIFY,
    user_properties: identify.getUserProperties(),
    groups: {
      [groupType]: groupName,
    },
  };
  return groupEvent;
};

export const createRevenueEvent = (revenue: Revenue, eventOptions?: EventOptions): RevenueEvent => {
  return {
    ...eventOptions,
    event_type: SpecialEventType.REVENUE,
    event_properties: revenue.getEventProperties(),
  };
};
