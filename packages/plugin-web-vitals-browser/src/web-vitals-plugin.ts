/* eslint-disable no-restricted-globals */
import { BrowserClient, BrowserConfig, EnrichmentPlugin, getGlobalScope, UUID } from '@amplitude/analytics-core';
import { PLUGIN_NAME, WEB_VITALS_EVENT_NAME } from './constants';
import { onLCP, onINP, onCLS, onFCP, FCPMetric } from 'web-vitals';

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

const globalScope = getGlobalScope();

export const webVitalsPlugin = (): BrowserEnrichmentPlugin => {
  let visibilityListener: ((this: Document, ev: Event) => any) | null = null;
  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
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
      const timestamp = performance.timeOrigin + (metric.entries[0]?.startTime || 0);
      webVitalsPayload['[Amplitude] LCP'] = {
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        navigationType: metric.navigationType,
        id: metric.id,
        timestamp: new Date(timestamp).toISOString(),
      };
    });

    onFCP((metric) => {
      isChanged = true;
      const timestamp = performance.timeOrigin + (metric.entries[0]?.startTime || 0);
      webVitalsPayload['[Amplitude] FCP'] = {
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        navigationType: metric.navigationType,
        id: metric.id,
        timestamp: new Date(timestamp).toISOString(),
      };
    });

    onINP((metric) => {
      console.log('INP metric:', metric);
      isChanged = true;
      const timestamp = performance.timeOrigin + (metric.entries[0]?.startTime || 0);
      webVitalsPayload['[Amplitude] INP'] = {
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        navigationType: metric.navigationType,
        id: metric.id,
        timestamp: new Date(timestamp).toISOString(),
      };
    });

    onCLS((metric) => {
      isChanged = true;
      const timestamp = performance.timeOrigin + (metric.entries[0]?.startTime || 0);
      webVitalsPayload['[Amplitude] CLS'] = {
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        navigationType: metric.navigationType,
        id: metric.id,
        timestamp: new Date(timestamp).toISOString(),
      };
    });

    visibilityListener = () => {
      if (doc.visibilityState === 'hidden' && isChanged) {
        amplitude.track(WEB_VITALS_EVENT_NAME, webVitalsPayload);
        isChanged = false;
      }
    };
    doc.addEventListener('visibilitychange', visibilityListener);
  };

  /* istanbul ignore next */
  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    if (visibilityListener) {
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
