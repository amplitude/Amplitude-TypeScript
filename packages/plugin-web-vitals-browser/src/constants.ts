export const PLUGIN_NAME = 'web-vitals-browser';
export const WEB_VITALS_EVENT_NAME = '[Amplitude] Web Vitals';
import type { Metric } from 'web-vitals';

/**
 * How long to wait, after a newer navigation starts reporting metrics, before sending the event for
 * a superseded navigation. Metrics for a navigation can be reported slightly after the next soft
 * navigation begins, so the event is deferred to give those late metrics a chance to land.
 */
export const SOFT_NAV_FLUSH_DELAY_MS = 1000;

export const WebVitalsMetricProperty = {
  LCP: '[Amplitude] LCP',
  FCP: '[Amplitude] FCP',
  INP: '[Amplitude] INP',
  CLS: '[Amplitude] CLS',
  TTFB: '[Amplitude] TTFB',
} as const;

export type WebVitalsMetricPropertyType = (typeof WebVitalsMetricProperty)[keyof typeof WebVitalsMetricProperty];

export type WebVitalsMetricPayload = {
  value: number;
  rating: Metric['rating'];
  delta: number;
  navigationType: Metric['navigationType'];
  id: string;
  timestamp: number;
  navigationStart: number;
  navigationId?: number;
};

export type WebVitalsEventPayload = {
  [P in WebVitalsMetricPropertyType]?: WebVitalsMetricPayload;
} & {
  '[Amplitude] Page Domain'?: string;
  '[Amplitude] Page Location'?: string;
  '[Amplitude] Page Path'?: string;
  '[Amplitude] Page Title'?: string;
  '[Amplitude] Page URL'?: string;
};
