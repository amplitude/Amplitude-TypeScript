import { TrackEvent, IdentifyEvent, GroupIdentifyEvent, SpecialEventType } from '@amplitude/analytics-types';

export const createTrackEvent = (eventType: string): TrackEvent => {
  // NOTE: placeholder
  return {
    event_type: eventType,
  };
};

export const createIdentifyEvent = (): IdentifyEvent => {
  // NOTE: placeholder
  return {
    event_type: SpecialEventType.IDENTIFY,
    user_properties: {},
  };
};

export const createGroupIdentifyEvent = (): GroupIdentifyEvent => {
  // NOTE: placeholder
  return {
    event_type: SpecialEventType.GROUP_IDENTIFY,
    group_properties: {},
  };
};
