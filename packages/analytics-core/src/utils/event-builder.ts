import { TrackEvent, IdentifyEvent, GroupIdentifyEvent, SpecialEventType, Identify } from '@amplitude/analytics-types';

export const createTrackEvent = (eventType: string): TrackEvent => {
  // NOTE: placeholder
  return {
    event_type: eventType,
  };
};

export const createIdentifyEvent = (identify: Identify, userId?: string, deviceId?: string): IdentifyEvent => {
  const identifyEvent: IdentifyEvent = {
    event_type: SpecialEventType.IDENTIFY,
    user_properties: identify.getUserProperties(),
    user_id: userId,
  };

  if (deviceId !== undefined && deviceId.length > 0) {
    identifyEvent.device_id = deviceId;
  }

  return identifyEvent;
};

export const createGroupIdentifyEvent = (): GroupIdentifyEvent => {
  // NOTE: placeholder
  return {
    event_type: SpecialEventType.GROUP_IDENTIFY,
    group_properties: {},
  };
};
