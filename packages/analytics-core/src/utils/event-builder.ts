import { Identify, IIdentify } from '../identify';
import { IRevenue } from '../revenue';
import { BaseEvent, EventOptions } from '../types/event/base-event';
import { TrackEvent, IdentifyEvent, GroupIdentifyEvent, SpecialEventType, RevenueEvent } from '../types/event/event';

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

export const createRevenueEvent = (revenue: IRevenue, eventOptions?: EventOptions): RevenueEvent => {
  return {
    ...eventOptions,
    event_type: SpecialEventType.REVENUE,
    event_properties: revenue.getEventProperties(),
  };
};
