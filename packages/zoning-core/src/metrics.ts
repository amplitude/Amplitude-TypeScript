import {
  MetricType,
  type MetricResult,
  type Zone,
  type ZoneMetric,
  type ZoneMetrics,
  type ZoneMetricsResponse,
} from './types';

export const getMetricKey = (metricType: MetricType): keyof ZoneMetrics => {
  switch (metricType) {
    case MetricType.CLICK_RATE_SESSION:
      return 'clickRateSession';
    case MetricType.CLICK_RATE_PAGEVIEW:
      return 'clickRatePageview';
    case MetricType.RAGE_CLICK_RATE_SESSION:
      return 'rageClickRateSession';
    case MetricType.RAGE_CLICK_RATE_PAGEVIEW:
      return 'rageClickRatePageview';
    case MetricType.CLICK_DISTRIBUTION:
      return 'clickDistribution';
    case MetricType.CLICK_RECURRENCE:
      return 'clickRecurrence';
    case MetricType.EXPOSURE_RATE:
      return 'exposureRate';
    case MetricType.SCROLL_REACH:
      return 'scrollReach';
    case MetricType.ATTRACTIVENESS_RATE:
      return 'attractivenessRate';
    case MetricType.REVENUE_PER_CLICK:
      return 'revenuePerClick';
    default:
      return 'clickRateSession';
  }
};

export const getMetricValue = (zoneMetric: ZoneMetric | undefined, metricType: MetricType): number | null => {
  const metricKey = getMetricKey(metricType);
  const metricResult = zoneMetric?.metrics[metricKey];
  if (metricResult && typeof metricResult.metricValue === 'number') {
    return metricResult.metricValue;
  }
  return null;
};

const EVENT_COUNT_FIELD_BY_METRIC: Partial<Record<MetricType, string>> = {
  [MetricType.CLICK_DISTRIBUTION]: 'zoneClickCount',
  [MetricType.CLICK_RECURRENCE]: 'zoneClickCount',
  [MetricType.CLICK_RATE_SESSION]: 'clickSessionCount',
  [MetricType.CLICK_RATE_PAGEVIEW]: 'clickPageviewCount',
  [MetricType.RAGE_CLICK_RATE_SESSION]: 'rageClickSessionCount',
  [MetricType.RAGE_CLICK_RATE_PAGEVIEW]: 'rageClickPageviewCount',
  [MetricType.EXPOSURE_RATE]: 'zoneExposureCount',
  [MetricType.ATTRACTIVENESS_RATE]: 'exposedPageviewsWithClick',
};

const readNumericField = (result: MetricResult | undefined, field: string): number | null => {
  const value = (result as Record<string, unknown> | undefined)?.[field];
  return typeof value === 'number' ? value : null;
};

export const getZoneEventCount = (zoneMetric: ZoneMetric | undefined, metricType: MetricType): number | null => {
  const field = EVENT_COUNT_FIELD_BY_METRIC[metricType];
  if (!field) {
    return null;
  }
  return readNumericField(zoneMetric?.metrics[getMetricKey(metricType)], field);
};

export const extractZoneMetrics = (response: ZoneMetricsResponse | undefined): ZoneMetric[] | undefined => {
  return response?.data?.[0]?.zoneMetrics;
};

export const extractZoneSelectors = (response: ZoneMetricsResponse | undefined): string[] => {
  return extractZoneMetrics(response)?.map((zm) => zm.selector) ?? [];
};

export const buildZoneMetricsMap = (
  initialResponse: ZoneMetricsResponse | undefined,
  parentResponses: Array<ZoneMetricsResponse | undefined>,
): Map<string, ZoneMetric> => {
  const metricsMap = new Map<string, ZoneMetric>();

  const initialZoneMetrics = extractZoneMetrics(initialResponse);
  if (initialZoneMetrics) {
    initialZoneMetrics.forEach((metric) => {
      metricsMap.set(metric.selector, { ...metric });
    });
  }

  parentResponses.forEach((parentResponse) => {
    const parentZoneMetrics = extractZoneMetrics(parentResponse);
    if (!parentZoneMetrics) {
      return;
    }

    parentZoneMetrics.forEach((metric) => {
      metricsMap.set(metric.selector, { ...metric });
    });
  });

  return metricsMap;
};

export const buildZoneMetricsMapClientSide = (
  zoneMetrics: ZoneMetric[],
  parentZoneQueryConfigs: Array<{ parentZoneId: string; zoneIds: string[] }>,
  metricType: MetricType,
): Map<string, ZoneMetric> => {
  const metricsMap = new Map<string, ZoneMetric>();
  zoneMetrics.forEach((metric) => {
    metricsMap.set(metric.selector, { ...metric });
  });

  const metricKey = getMetricKey(metricType);
  const countField = EVENT_COUNT_FIELD_BY_METRIC[metricType];

  parentZoneQueryConfigs.forEach((config) => {
    const { parentZoneId, zoneIds } = config;

    let parentMetric = metricsMap.get(parentZoneId);
    if (!parentMetric) {
      parentMetric = {
        selector: parentZoneId,
        metrics: {},
      };
      metricsMap.set(parentZoneId, parentMetric);
    }

    const parentMetricResult = parentMetric.metrics[metricKey];
    const selfValue = parentMetricResult?.metricValue ?? 0;
    const selfCount = countField ? readNumericField(parentMetricResult, countField) ?? 0 : 0;

    let childrenSum = 0;
    let childrenCountSum = 0;
    zoneIds.forEach((zoneId) => {
      if (zoneId === parentZoneId) {
        return;
      }
      const childMetric = metricsMap.get(zoneId);
      if (childMetric) {
        const childMetricResult = childMetric.metrics[metricKey];
        childrenSum += childMetricResult?.metricValue ?? 0;
        if (countField) {
          childrenCountSum += readNumericField(childMetricResult, countField) ?? 0;
        }
      }
    });

    const parentValue = selfValue + childrenSum;
    const parentCount = selfCount + childrenCountSum;

    const updatedMetricResult = {
      ...(parentMetricResult ?? {}),
      metricValue: parentValue,
      ...(countField ? { [countField]: parentCount } : {}),
    } as MetricResult;

    const updatedMetric: ZoneMetric = {
      ...parentMetric,
      metrics: {
        ...parentMetric.metrics,
        [metricKey]: updatedMetricResult,
      },
    };

    metricsMap.set(parentZoneId, updatedMetric);
  });

  return metricsMap;
};

const LOW_COLOR: [number, number, number] = [59, 130, 246];
const HIGH_COLOR: [number, number, number] = [220, 50, 50];
const EQUAL_COLOR: [number, number, number] = [120, 80, 200];

interface GetZoneColorOptions {
  value: number;
  min: number;
  max: number;
}

export const getZoneColor = ({ value, min, max }: GetZoneColorOptions): [number, number, number] => {
  if (min === max) {
    return [...EQUAL_COLOR];
  }
  const t = (value - min) / (max - min);
  const r = Math.round(LOW_COLOR[0] + t * (HIGH_COLOR[0] - LOW_COLOR[0]));
  const g = Math.round(LOW_COLOR[1] + t * (HIGH_COLOR[1] - LOW_COLOR[1]));
  const b = Math.round(LOW_COLOR[2] + t * (HIGH_COLOR[2] - LOW_COLOR[2]));
  return [r, g, b];
};

interface GetMetricRangeOptions {
  zones: Zone[];
}

export const getMetricRange = ({ zones }: GetMetricRangeOptions): { min: number; max: number } | null => {
  const zonesWithContent = zones.filter((z) => z.hasContent);
  if (zonesWithContent.length === 0) {
    return null;
  }
  const values = zonesWithContent.map((z) => z.percentage);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
};

export const isSelectorTooGeneric = (selector: string): boolean => {
  return /^[a-z][a-z0-9]*$/i.test(selector.trim());
};

export const findMatchingZoneMetric = (zone: Zone, zoneMetricsMap: Map<string, ZoneMetric>): ZoneMetric | undefined => {
  const exactMatch = zoneMetricsMap.get(zone.id);

  if (exactMatch) {
    return exactMatch;
  }

  if (!zone.htmlElement) {
    return undefined;
  }

  const specificMetrics = [...zoneMetricsMap.values()].filter((metric) => !isSelectorTooGeneric(metric.selector));

  const cssMatch = specificMetrics.find((metric) => {
    try {
      return zone.htmlElement.matches(metric.selector);
    } catch {
      return false;
    }
  });

  if (cssMatch) {
    return cssMatch;
  }

  return undefined;
};
