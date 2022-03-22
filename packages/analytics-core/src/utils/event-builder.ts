import {
  TrackEvent,
  IdentifyEvent,
  GroupIdentifyEvent,
  SpecialEventType,
  Identify,
  Revenue,
  RevenueEvent,
} from '@amplitude/analytics-types';

export const createTrackEvent = (
  eventType: string,
  eventProperties?: Record<string, any>,
  eventOptions?: Partial<TrackEvent>,
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
  identify: Identify,
  eventOptions?: Partial<IdentifyEvent>,
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
  identify: Identify,
  eventOptions?: Partial<GroupIdentifyEvent>,
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

export const createRevenueEvent = (revenue: Revenue, eventOptions?: Partial<RevenueEvent>): RevenueEvent => {
  return {
    ...eventOptions,
    event_type: SpecialEventType.REVENUE,
    event_properties: revenue.getEventProperties(),
  };
};
