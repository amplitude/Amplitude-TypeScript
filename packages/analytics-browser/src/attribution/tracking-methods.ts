import { AttributionOptions, TrackingMethod } from '@amplitude/analytics-core';

export const USER_PROPERTY_TRACKING_METHOD: TrackingMethod = 'userProperty';
export const EVENT_PROPERTY_TRACKING_METHOD: TrackingMethod = 'eventProperty';

export const normalizeTrackingMethod = (trackingMethod?: TrackingMethod | TrackingMethod[]): TrackingMethod[] => {
  if (typeof trackingMethod === 'undefined') {
    return [USER_PROPERTY_TRACKING_METHOD];
  }

  if (!Array.isArray(trackingMethod)) {
    return [trackingMethod];
  }

  return [...new Set(trackingMethod)];
};

export const hasTrackingMethod = (options: AttributionOptions, trackingMethod: TrackingMethod) =>
  normalizeTrackingMethod(options.trackingMethod).includes(trackingMethod);

export const isUserPropertyAttributionEnabled = (options: AttributionOptions) =>
  hasTrackingMethod(options, USER_PROPERTY_TRACKING_METHOD);

export const isEventPropertyAttributionEnabled = (options: AttributionOptions) =>
  hasTrackingMethod(options, EVENT_PROPERTY_TRACKING_METHOD);
