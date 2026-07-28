import { AttributionOptions, TrackingMethod } from '@amplitude/analytics-core';

export const USER_PROPERTY_TRACKING_METHOD: TrackingMethod = 'userProperty';
export const EVENT_PROPERTY_TRACKING_METHOD: TrackingMethod = 'eventProperty';

const isTrackingMethod = (value: unknown): value is TrackingMethod =>
  value === USER_PROPERTY_TRACKING_METHOD || value === EVENT_PROPERTY_TRACKING_METHOD;

/**
 * The default tracking methods used when no valid method is configured. Both run by default and
 * are independent.
 */
const DEFAULT_TRACKING_METHODS: readonly TrackingMethod[] = [
  USER_PROPERTY_TRACKING_METHOD,
  EVENT_PROPERTY_TRACKING_METHOD,
];

/**
 * Normalizes attribution tracking methods from runtime config, drops unsupported values,
 * and falls back to the default methods when nothing valid is provided.
 */
export const normalizeTrackingMethod = (trackingMethod?: unknown): TrackingMethod[] => {
  const normalized = [
    ...new Set((Array.isArray(trackingMethod) ? trackingMethod : [trackingMethod]).filter(isTrackingMethod)),
  ];

  return normalized.length > 0 ? normalized : [...DEFAULT_TRACKING_METHODS];
};

export const hasTrackingMethod = (options: AttributionOptions, trackingMethod: TrackingMethod) =>
  normalizeTrackingMethod(options.trackingMethod).includes(trackingMethod);

export const isUserPropertyAttributionEnabled = (options: AttributionOptions) =>
  hasTrackingMethod(options, USER_PROPERTY_TRACKING_METHOD);

export const isEventPropertyAttributionEnabled = (options: AttributionOptions) =>
  hasTrackingMethod(options, EVENT_PROPERTY_TRACKING_METHOD);
