export const PLUGIN_NAME = 'web-vitals-browser';
export const WEB_VITALS_EVENT_NAME = '[Amplitude] Web Vitals';

/**
 * How long to wait, after a newer navigation starts reporting metrics, before sending the event for
 * a superseded navigation. Metrics for a navigation can be reported slightly after the next soft
 * navigation begins, so the event is deferred to give those late metrics a chance to land.
 */
export const SOFT_NAV_FLUSH_DELAY_MS = 1000;
