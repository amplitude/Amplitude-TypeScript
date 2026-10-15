import {
  getAllowQueryParamsFromScope,
  getPageUrlFromScope,
  getPageUrlOperatorFromScope,
  stripQueryAndHash,
} from './page-scope';
import {
  MetricType,
  PAGE_URL_OPERATOR_CONTAINS,
  PAGE_URL_OPERATOR_EXACT,
  type PageScope,
  type Segment,
  type ZoneMetricsRequest,
  type ZoningEventFilter,
} from './types';

export interface BuildZoneMetricsRequestInput {
  metricType: MetricType;
  pageScope: PageScope | null;
  start: string;
  end: string;
  segment?: Segment | null;
  eventFilters?: ZoningEventFilter[];
  parentZoneId?: string;
  zoneIds?: string[];
  pageGroupId?: string;
  freshness?: string;
}

export interface BuildZoneMetricsRequestResult {
  request: ZoneMetricsRequest;
  queryKeyParts: Record<string, unknown>;
  enabled: boolean;
}

export const buildZoneMetricsRequest = ({
  metricType,
  pageScope,
  start,
  end,
  segment = null,
  eventFilters,
  parentZoneId,
  zoneIds = [],
  pageGroupId,
  freshness,
}: BuildZoneMetricsRequestInput): BuildZoneMetricsRequestResult => {
  const sortedZoneIds = [...zoneIds].sort();
  const rawPageUrl = pageScope ? getPageUrlFromScope(pageScope) : undefined;
  const rawPageUrlOperator = pageScope ? getPageUrlOperatorFromScope(pageScope) : undefined;
  const allowQueryParams = pageScope ? getAllowQueryParamsFromScope(pageScope) : false;
  const skipStrip = allowQueryParams || rawPageUrlOperator === PAGE_URL_OPERATOR_CONTAINS;
  let pageUrl: string = stripQueryAndHash(rawPageUrl);
  if (skipStrip) {
    pageUrl = rawPageUrl ?? '';
  }
  const effectivePageGroupId = pageGroupId ?? pageScope?.pageGroupId;
  const hasPageScope = !!pageUrl || !!effectivePageGroupId;

  let pageUrlOperator: typeof rawPageUrlOperator;
  if (!effectivePageGroupId && rawPageUrlOperator && rawPageUrlOperator !== PAGE_URL_OPERATOR_EXACT) {
    pageUrlOperator = rawPageUrlOperator;
  }

  const includeAllowQueryParams: boolean = !effectivePageGroupId && allowQueryParams;

  const base = {
    metrics: [metricType] as ZoneMetricsRequest['metrics'],
    start,
    end,
    parentZoneId,
    zoneIds: sortedZoneIds,
    segments: segment ? [segment] : undefined,
    eventFilters: eventFilters && eventFilters.length > 0 ? eventFilters : undefined,
    ...(freshness ? { freshness } : {}),
  };

  let request: ZoneMetricsRequest;
  if (effectivePageGroupId) {
    request = { ...base, pageGroupId: effectivePageGroupId };
  } else if (pageUrlOperator) {
    request = { ...base, pageUrl, pageUrlOperator };
  } else {
    request = { ...base, pageUrl };
  }

  if (includeAllowQueryParams) {
    request = { ...request, allowQueryParams: true };
  }

  const queryKeyParts: Record<string, unknown> = {
    metric: metricType,
    ...(effectivePageGroupId
      ? { pageGroupId: effectivePageGroupId }
      : {
          pageUrl,
          ...(pageUrlOperator ? { pageUrlOperator } : {}),
          ...(includeAllowQueryParams ? { allowQueryParams: true } : {}),
        }),
    start,
    end,
    parentZoneId,
    zoneIds: sortedZoneIds,
    segments: segment,
    eventFilters,
    ...(freshness ? { freshness } : {}),
  };

  const enabled = hasPageScope && (!parentZoneId || sortedZoneIds.length > 0);

  return { request, queryKeyParts, enabled };
};
