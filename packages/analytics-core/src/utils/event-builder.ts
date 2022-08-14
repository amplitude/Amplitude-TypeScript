import {
  BaseEvent,
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
  eventInput: BaseEvent | string,
  eventProperties?: Record<string, any>,
  eventOptions?: EventOptions,
): TrackEvent => {
  const baseEvent: BaseEvent = typeof eventInput === 'string' ? { event_type: eventInput } : eventInput;
  return {
    ...baseEvent,
    ...eventOptions,
    ...(eventProperties && { event_properties: eventProperties }),
  };
};

export const createIdentifyEvent = (identify: IIdentify, eventOptions?: EventOptions): IdentifyEvent => {
  const identifyEvent: IdentifyEvent = {
    ...eventOptions,
    event_type: SpecialEventType.IDENTIFY,
    user_properties: identify.getUserProperties(),
  };

  return identifyEvent;
};

export const createGroupIdentifyEvent = (
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
  };

  return groupIdentify;
};

export const createGroupEvent = (groupType: string, groupName: string | string[], eventOptions?: EventOptions) => {
  const identify = new Identify();
  identify.set(groupType, groupName);

  const groupEvent: IdentifyEvent = {
    ...eventOptions,
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
