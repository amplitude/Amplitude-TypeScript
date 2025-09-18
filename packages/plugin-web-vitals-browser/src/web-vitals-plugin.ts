/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  getGlobalScope,
  getDecodeURI,
} from '@amplitude/analytics-core';
import { PLUGIN_NAME, WEB_VITALS_EVENT_NAME } from './constants';
import { onLCP, onINP, onCLS, onFCP, onTTFB, Metric } from 'web-vitals';

export type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

type WebVitalsMetricPayload = {
  value: number;
  rating: Metric['rating'];
  delta: number;
  navigationType: Metric['navigationType'];
  id: string;
  timestamp: number;
  navigationStart: number;
};

type WebVitalsEventPayload = {
  '[Amplitude] LCP'?: WebVitalsMetricPayload;
  '[Amplitude] FCP'?: WebVitalsMetricPayload;
  '[Amplitude] INP'?: WebVitalsMetricPayload;
  '[Amplitude] CLS'?: WebVitalsMetricPayload;
  '[Amplitude] TTFB'?: WebVitalsMetricPayload;
  '[Amplitude] Page Domain'?: string;
  '[Amplitude] Page Location'?: string;
  '[Amplitude] Page Path'?: string;
  '[Amplitude] Page Title'?: string;
  '[Amplitude] Page URL'?: string;
};

function getMetricStartTime(metric: Metric) {
  /* istanbul ignore next */
  const startTime = metric.entries[0]?.startTime || 0;
  return performance.timeOrigin + startTime;
}

function processMetric(metric: Metric) {
  return {
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    navigationType: metric.navigationType,
    id: metric.id,
    timestamp: Math.floor(getMetricStartTime(metric)),
    navigationStart: Math.floor(performance.timeOrigin),
  };
}

export const webVitalsPlugin = (): BrowserEnrichmentPlugin => {
  let visibilityListener: ((this: Document, ev: Event) => void) | null = null;
  const globalScope = getGlobalScope();
  const doc = globalScope?.document;
  const location = globalScope?.location;
  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    if (doc === undefined) {
      return;
    }
    const locationHref = getDecodeURI(/* istanbul ignore next */ location?.href || '', config.loggerProvider);
    const webVitalsPayload: WebVitalsEventPayload = {
      '[Amplitude] Page Domain': /* istanbul ignore next */ location?.hostname || '',
      '[Amplitude] Page Location': locationHref,
      '[Amplitude] Page Path': getDecodeURI(/* istanbul ignore next */ location?.pathname || '', config.loggerProvider),
      '[Amplitude] Page Title': /* istanbul ignore next */ (typeof document !== 'undefined' && document.title) || '',
      '[Amplitude] Page URL': locationHref.split('?')[0],
    };

    onLCP((metric) => {
      webVitalsPayload['[Amplitude] LCP'] = processMetric(metric);
    });

    onFCP((metric) => {
      webVitalsPayload['[Amplitude] FCP'] = processMetric(metric);
    });

    onINP((metric) => {
      webVitalsPayload['[Amplitude] INP'] = processMetric(metric);
    });

    onCLS((metric) => {
      webVitalsPayload['[Amplitude] CLS'] = processMetric(metric);
    });

    onTTFB((metric) => {
      webVitalsPayload['[Amplitude] TTFB'] = processMetric(metric);
    });

    visibilityListener = () => {
      if (doc.visibilityState === 'hidden' && visibilityListener) {
        amplitude.track(WEB_VITALS_EVENT_NAME, webVitalsPayload);
        doc.removeEventListener('visibilitychange', visibilityListener);
        visibilityListener = null;
      }
    };
    doc.addEventListener('visibilitychange', visibilityListener);
  };

  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    if (visibilityListener) {
      /* istanbul ignore next */
      doc?.removeEventListener('visibilitychange', visibilityListener);
    }
  };

  return {
    name: PLUGIN_NAME,
    type: 'enrichment',
    setup,
    execute,
    teardown,
  };
};
