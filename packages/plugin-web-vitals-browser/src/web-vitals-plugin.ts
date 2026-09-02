/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  ILogger,
  WebVitalsOptions,
  getGlobalScope,
  getDecodeURI,
} from '@amplitude/analytics-core';
import { PLUGIN_NAME, SOFT_NAV_FLUSH_DELAY_MS, WEB_VITALS_EVENT_NAME } from './constants';
import { onLCP, onINP, onCLS, onFCP, onTTFB, Metric, ReportOpts } from 'web-vitals';

export type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

type WebVitalsMetricPayload = {
  value: number;
  rating: Metric['rating'];
  delta: number;
  navigationType: Metric['navigationType'];
  id: string;
  timestamp: number;
  navigationStart: number;
  navigationId?: Metric['navigationId'];
};

type WebVitalsMetricProperty =
  | '[Amplitude] LCP'
  | '[Amplitude] FCP'
  | '[Amplitude] INP'
  | '[Amplitude] CLS'
  | '[Amplitude] TTFB';

type WebVitalsEventPayload = {
  [property in WebVitalsMetricProperty]?: WebVitalsMetricPayload;
} & {
  '[Amplitude] Page Domain'?: string;
  '[Amplitude] Page Location'?: string;
  '[Amplitude] Page Path'?: string;
  '[Amplitude] Page Title'?: string;
  '[Amplitude] Page URL'?: string;
};

const METRIC_PROPERTIES: WebVitalsMetricProperty[] = [
  '[Amplitude] LCP',
  '[Amplitude] FCP',
  '[Amplitude] INP',
  '[Amplitude] CLS',
  '[Amplitude] TTFB',
];

/**
 * Bucket key used when soft navigation reporting is off. All metrics belong to the initial page
 * load, so they are collected into a single event.
 */
const INITIAL_NAVIGATION_KEY = 0;

function getMetricStartTime(metric: Metric) {
  /* istanbul ignore next */
  const startTime = metric.entries[0]?.startTime || 0;
  return performance.timeOrigin + startTime;
}

function processMetric(metric: Metric, reportSoftNavs: boolean): WebVitalsMetricPayload {
  return {
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    navigationType: metric.navigationType,
    id: metric.id,
    timestamp: Math.floor(getMetricStartTime(metric)),
    // A soft navigation's metrics are measured from the start of that navigation rather than from
    // the document's time origin. `navigationStartTime` is 0 for the initial page load.
    navigationStart: Math.floor(performance.timeOrigin + /* istanbul ignore next */ (metric.navigationStartTime || 0)),
    // Only included when reporting soft navigations so the default event stays byte-identical.
    ...(reportSoftNavs && { navigationId: metric.navigationId }),
  };
}

/**
 * Builds the page properties for the URL the metrics belong to. That is the URL of the navigation
 * being reported on, which is not necessarily the current URL: when reporting soft navigations, a
 * navigation's metrics can be reported after the next navigation has already started.
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

export const webVitalsPlugin = (options: WebVitalsOptions = {}): BrowserEnrichmentPlugin => {
  const reportSoftNavs = options.reportSoftNav === true;
  let visibilityListener: ((this: Document, ev: Event) => void) | null = null;
  let flushTimeout: ReturnType<typeof setTimeout> | undefined;
  const globalScope = getGlobalScope();
  const doc = globalScope?.document;
  const location = globalScope?.location;

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    if (doc === undefined) {
      return;
    }

    // One payload per navigation, keyed by the navigation its metrics belong to. When soft
    // navigation reporting is off there is only ever the initial page load's payload.
    const payloads = new Map<number, WebVitalsEventPayload>();
    let latestNavigationId = -1;

    if (!reportSoftNavs) {
      payloads.set(
        INITIAL_NAVIGATION_KEY,
        getPageProperties(
          /* istanbul ignore next */ location?.href || '',
          /* istanbul ignore next */ doc.title || '',
          config.loggerProvider,
        ),
      );
    }

    const getPayload = (metric: Metric): WebVitalsEventPayload => {
      const key = reportSoftNavs ? metric.navigationId : INITIAL_NAVIGATION_KEY;
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

      // An event with no metrics is only possible when reporting soft navigations, where the page
      // can be hidden repeatedly without a new navigation reporting anything.
      if (!reportSoftNavs || hasMetrics(payload)) {
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

    const recordMetric = (property: WebVitalsMetricProperty) => (metric: Metric) => {
      getPayload(metric)[property] = processMetric(metric, reportSoftNavs);

      if (reportSoftNavs && metric.navigationId > latestNavigationId) {
        if (latestNavigationId !== -1) {
          scheduleFlushOfPreviousNavigations(metric.navigationId);
        }
        latestNavigationId = metric.navigationId;
      }
    };

    const reportOpts: ReportOpts | undefined = reportSoftNavs ? { reportSoftNavs: true } : undefined;

    onLCP(recordMetric('[Amplitude] LCP'), reportOpts);
    onFCP(recordMetric('[Amplitude] FCP'), reportOpts);
    onINP(recordMetric('[Amplitude] INP'), reportOpts);
    onCLS(recordMetric('[Amplitude] CLS'), reportOpts);
    onTTFB(recordMetric('[Amplitude] TTFB'), reportOpts);

    visibilityListener = () => {
      if (doc.visibilityState === 'hidden' && visibilityListener) {
        flushAll();

        // When reporting soft navigations, keep listening: the page can become visible again and
        // report metrics for further navigations.
        if (!reportSoftNavs) {
          doc.removeEventListener('visibilitychange', visibilityListener);
          visibilityListener = null;
        }
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
