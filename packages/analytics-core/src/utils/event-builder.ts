import { TrackEvent, IdentifyEvent, GroupIdentifyEvent, SpecialEventType } from '@amplitude/analytics-types';
import { Identify } from 'src/Identify';

export const createTrackEvent = (eventType: string): TrackEvent => {
  // NOTE: placeholder
  return {
    event_type: eventType,
  };
};

export const createIdentifyEvent = (userId: string, deviceId: string, identify: Identify): IdentifyEvent => {
  const identifyEvent: IdentifyEvent = {
    event_type: SpecialEventType.IDENTIFY,
    user_properties: identify.getUserProperties(),
    user_id: userId,
  };

  if (deviceId !== null && deviceId.length > 0) {
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
