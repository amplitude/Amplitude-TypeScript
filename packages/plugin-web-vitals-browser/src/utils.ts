import { WebVitalsMetricPayload } from './constants';
import { Metric } from 'web-vitals';

function getMetricStartTime(metric: Metric) {
  /* istanbul ignore next */
  const startTime = metric.entries[0]?.startTime || 0;
  return performance.timeOrigin + startTime;
}

export function processMetric(metric: Metric, isSoftNav = false): WebVitalsMetricPayload {
  const payload: WebVitalsMetricPayload = {
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    navigationType: metric.navigationType,
    id: metric.id,
    timestamp: Math.floor(getMetricStartTime(metric)),
    navigationStart: !isSoftNav
      ? Math.floor(performance.timeOrigin)
      : Math.floor(performance.timeOrigin + /* istanbul ignore next */ (metric.navigationStartTime || 0)),
  };

  if (isSoftNav) {
    payload.navigationId = metric.navigationId;
  }

  return payload;
}
