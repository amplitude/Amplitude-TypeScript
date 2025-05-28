/* eslint-disable no-restricted-globals */
import { BrowserClient, BrowserConfig, EnrichmentPlugin, getGlobalScope, UUID } from '@amplitude/analytics-core';
import { PLUGIN_NAME, WEB_VITALS_EVENT_NAME } from './constants';
import { onLCP, onINP, onCLS, onFCP, FCPMetric, LCPMetric, INPMetric, CLSMetric } from 'web-vitals';

export type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

interface WebVitalsMetric {
  value: number;
  rating: FCPMetric['rating'];
  delta: number;
  navigationType: FCPMetric['navigationType'];
  id: string;
  timestamp: string; // ISO 8601 format
}

interface WebVitalsPayload {
  metricId: string;
  ['[Amplitude] LCP']?: WebVitalsMetric;
  ['[Amplitude] FCP']?: WebVitalsMetric;
  ['[Amplitude] INP']?: WebVitalsMetric;
  ['[Amplitude] CLS']?: WebVitalsMetric;
}

function getMetricStartTime(metric: FCPMetric | LCPMetric | INPMetric | CLSMetric) {
  /* istanbul ignore next */
  const startTime = metric.entries[0]?.startTime || 0;
  const epoch = performance.timeOrigin + startTime;
  return new Date(epoch).toISOString();
}

function processMetric(metric: FCPMetric | LCPMetric | INPMetric | CLSMetric) {
  return {
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    navigationType: metric.navigationType,
    id: metric.id,
    timestamp: getMetricStartTime(metric),
  };
}

export const webVitalsPlugin = (): BrowserEnrichmentPlugin => {
  let visibilityListener: ((this: Document, ev: Event) => void) | null = null;
  const setup: BrowserEnrichmentPlugin['setup'] = async (_, amplitude) => {
    const globalScope = getGlobalScope();
    const metricId = UUID();
    let isChanged = false;
    const doc = globalScope?.document;
    if (doc === undefined) {
      return;
    }
    const webVitalsPayload: WebVitalsPayload = {
      metricId,
    };

    onLCP((metric) => {
      isChanged = true;
      webVitalsPayload['[Amplitude] LCP'] = processMetric(metric);
    });

    onFCP((metric) => {
      isChanged = true;
      webVitalsPayload['[Amplitude] FCP'] = processMetric(metric);
    });

    onINP((metric) => {
      isChanged = true;
      webVitalsPayload['[Amplitude] INP'] = processMetric(metric);
    });

    onCLS((metric) => {
      isChanged = true;
      webVitalsPayload['[Amplitude] CLS'] = processMetric(metric);
    });

    visibilityListener = () => {
      if (doc.visibilityState === 'hidden' && isChanged) {
        amplitude.track(WEB_VITALS_EVENT_NAME, webVitalsPayload);
        isChanged = false;
      }
    };
    doc.addEventListener('visibilitychange', visibilityListener);
  };

  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    if (visibilityListener) {
      const globalScope = getGlobalScope();
      /* istanbul ignore next */
      globalScope?.document?.removeEventListener('visibilitychange', visibilityListener);
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
