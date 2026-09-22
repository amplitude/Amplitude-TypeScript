/* eslint-disable no-restricted-globals */
import { onLCP, onINP, onCLS, onFCP, onTTFB, Metric } from 'web-vitals';
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  ILogger,
  getGlobalScope,
  getDecodeURI,
} from '@amplitude/analytics-core';
import {
  PLUGIN_NAME,
  SOFT_NAV_FLUSH_DELAY_MS,
  WEB_VITALS_EVENT_NAME,
  WebVitalsEventPayload,
  WebVitalsMetricProperty,
  WebVitalsMetricPropertyType,
} from './constants';
import { processMetric } from './utils';

export type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

const METRIC_PROPERTIES = Object.values(WebVitalsMetricProperty);

/**
 * Builds the page properties for the URL the metrics belong to. That is the URL of the navigation
 * being reported on, which is not necessarily the current URL: a navigation's metrics can be
 * reported after the next navigation has already started.
 */
function getPageProperties(url: string, title: string, loggerProvider: ILogger): WebVitalsEventPayload {
  let hostname = '';
  let pathname = '';
  try {
    const parsedUrl = new URL(url);
    hostname = parsedUrl.hostname;
    pathname = parsedUrl.pathname;
  } catch (e) {
    loggerProvider.debug('Web vitals plugin is unable to parse page URL: ', e);
  }

  const locationHref = getDecodeURI(url, loggerProvider);

  return {
    '[Amplitude] Page Domain': hostname,
    '[Amplitude] Page Location': locationHref,
    '[Amplitude] Page Path': getDecodeURI(pathname, loggerProvider),
    '[Amplitude] Page Title': title,
    '[Amplitude] Page URL': getDecodeURI(locationHref.split('?')[0], loggerProvider),
  };
}

function hasMetrics(payload: WebVitalsEventPayload): boolean {
  return METRIC_PROPERTIES.some((property) => property in payload);
}

export const webVitalsSoftNavPlugin = (): BrowserEnrichmentPlugin => {
  let visibilityListener: ((this: Document, ev: Event) => void) | null = null;
  let flushTimeout: ReturnType<typeof setTimeout> | undefined;
  const globalScope = getGlobalScope();
  const doc = globalScope?.document;
  const location = globalScope?.location;

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    if (doc === undefined) {
      return;
    }

    // One payload per navigation, keyed by the navigation its metrics belong to.
    const payloads = new Map<number, WebVitalsEventPayload>();
    let latestNavigationId = -1;

    const getPayload = (metric: Metric): WebVitalsEventPayload => {
      const key = metric.navigationId;
      let payload = payloads.get(key);
      if (!payload) {
        payload = getPageProperties(
          /* istanbul ignore next */ metric.navigationURL || location?.href || '',
          /* istanbul ignore next */ doc.title || '',
          config.loggerProvider,
        );
        payloads.set(key, payload);
      }
      return payload;
    };

    const flush = (key: number) => {
      const payload = payloads.get(key);
      /* istanbul ignore if */
      if (!payload) {
        return;
      }
      payloads.delete(key);

      // The page can be hidden repeatedly without a new navigation reporting anything.
      if (hasMetrics(payload)) {
        amplitude.track(WEB_VITALS_EVENT_NAME, payload);
      }
    };

    const flushAll = () => {
      for (const key of Array.from(payloads.keys())) {
        flush(key);
      }
    };

    // Once a newer navigation starts reporting metrics, the navigations before it are final. Sending
    // them is deferred briefly so metrics reported late still make it into their event.
    const scheduleFlushOfPreviousNavigations = (currentNavigationId: number) => {
      if (flushTimeout !== undefined) {
        clearTimeout(flushTimeout);
      }
      flushTimeout = setTimeout(() => {
        flushTimeout = undefined;
        for (const key of Array.from(payloads.keys())) {
          if (key < currentNavigationId) {
            flush(key);
          }
        }
      }, SOFT_NAV_FLUSH_DELAY_MS);
    };

    const recordMetric = (property: WebVitalsMetricPropertyType) => (metric: Metric) => {
      getPayload(metric)[property] = processMetric(metric, true);

      if (metric.navigationId > latestNavigationId) {
        if (latestNavigationId !== -1) {
          scheduleFlushOfPreviousNavigations(metric.navigationId);
        }
        latestNavigationId = metric.navigationId;
      }
    };

    const reportOpts = { reportSoftNavs: true };

    onLCP(recordMetric(WebVitalsMetricProperty.LCP), reportOpts);
    onFCP(recordMetric(WebVitalsMetricProperty.FCP), reportOpts);
    onINP(recordMetric(WebVitalsMetricProperty.INP), reportOpts);
    onCLS(recordMetric(WebVitalsMetricProperty.CLS), reportOpts);
    onTTFB(recordMetric(WebVitalsMetricProperty.TTFB), reportOpts);

    visibilityListener = () => {
      if (doc.visibilityState === 'hidden' && visibilityListener) {
        flushAll();
        // Keep listening: the page can become visible again and report metrics for further navigations.
      }
    };
    doc.addEventListener('visibilitychange', visibilityListener);
  };

  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    if (flushTimeout !== undefined) {
      clearTimeout(flushTimeout);
      flushTimeout = undefined;
    }
    if (visibilityListener) {
      /* istanbul ignore next */
      doc?.removeEventListener('visibilitychange', visibilityListener);
      visibilityListener = null;
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
