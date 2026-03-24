import {
  EVENT_PROPERTY_TRACKING_METHOD,
  USER_PROPERTY_TRACKING_METHOD,
  getAttributionTrackingOptions,
  hasTrackingMethod,
  isEventPropertyAttributionEnabled,
  isUserPropertyAttributionEnabled,
  normalizeTrackingMethod,
} from '../../src/attribution/tracking-methods';

describe('tracking-methods', () => {
  test('should default to user property tracking', () => {
    expect(getAttributionTrackingOptions()).toEqual({
      fallbackAttributionEvent: false,
      trackingMethod: [USER_PROPERTY_TRACKING_METHOD],
    });
  });

  test('should normalize and dedupe tracking methods', () => {
    expect(normalizeTrackingMethod([USER_PROPERTY_TRACKING_METHOD, EVENT_PROPERTY_TRACKING_METHOD, USER_PROPERTY_TRACKING_METHOD])).toEqual([
      USER_PROPERTY_TRACKING_METHOD,
      EVENT_PROPERTY_TRACKING_METHOD,
    ]);
  });

  test('should detect enabled tracking methods', () => {
    const options = getAttributionTrackingOptions({
      trackingMethod: [USER_PROPERTY_TRACKING_METHOD, EVENT_PROPERTY_TRACKING_METHOD],
      fallbackAttributionEvent: true,
    });

    expect(hasTrackingMethod(options, USER_PROPERTY_TRACKING_METHOD)).toBe(true);
    expect(isUserPropertyAttributionEnabled(options)).toBe(true);
    expect(isEventPropertyAttributionEnabled(options)).toBe(true);
    expect(options.fallbackAttributionEvent).toBe(true);
  });

  test('should enable user property tracking by default', () => {
    const options = getAttributionTrackingOptions();

    expect(hasTrackingMethod(options, USER_PROPERTY_TRACKING_METHOD)).toBe(true);
    expect(isUserPropertyAttributionEnabled(options)).toBe(true);
    expect(isEventPropertyAttributionEnabled(options)).toBe(false);
  });
});
