/** Opaque segment payload forwarded to the zone-metrics API. */
export type Segment = Record<string, unknown>;

export enum MetricType {
  CLICK_RECURRENCE = 'CLICK_RECURRENCE',
  CLICK_DISTRIBUTION = 'CLICK_DISTRIBUTION',
  CLICK_RATE_SESSION = 'CLICK_RATE_SESSION',
  CLICK_RATE_PAGEVIEW = 'CLICK_RATE_PAGEVIEW',
  EXPOSURE_RATE = 'EXPOSURE_RATE',
  RAGE_CLICK_RATE_SESSION = 'RAGE_CLICK_RATE_SESSION',
  RAGE_CLICK_RATE_PAGEVIEW = 'RAGE_CLICK_RATE_PAGEVIEW',
  SCROLL_REACH = 'SCROLL_REACH',
  ATTRACTIVENESS_RATE = 'ATTRACTIVENESS_RATE',
  REVENUE_PER_CLICK = 'REVENUE_PER_CLICK',
}

export interface Zone {
  id: string;
  htmlElement: HTMLElement;
  rect: DOMRect;
  isActive: boolean;
  percentage: number;
  eventCount?: number | null;
  hasContent: boolean;
  selectorCrossesShadowDom?: boolean;
  zoneIds?: string[];
}

export interface ParentZoneQueryConfig {
  parentZoneId: string;
  zoneIds: string[];
}

export const PAGE_URL_OPERATOR_EXACT = 'is' as const;
export const PAGE_URL_OPERATOR_CONTAINS = 'contains' as const;

export type PageUrlOperator = typeof PAGE_URL_OPERATOR_EXACT | typeof PAGE_URL_OPERATOR_CONTAINS;

export type PageScope =
  | {
      pageUrl: string;
      pageUrlOperator?: PageUrlOperator;
      allowQueryParams?: boolean;
      pageGroupId?: undefined;
    }
  | {
      pageGroupId: string;
      pageUrl?: string;
      pageUrlOperator?: undefined;
      allowQueryParams?: undefined;
    };

export interface ZoningEventFilter {
  group_type: string;
  subprop_key: string;
  subprop_op: string;
  subprop_type: string;
  subprop_value: string[];
}

export interface ClickRateSessionResult {
  clickSessionCount?: number | null;
  totalSessions?: number | null;
  metricValue: number;
}

export interface ClickRatePageviewResult {
  clickPageviewCount?: number | null;
  totalPageviews?: number | null;
  metricValue: number;
}

export interface RageClickRateSessionResult {
  rageClickSessionCount?: number | null;
  totalSessions?: number | null;
  metricValue: number;
}

export interface RageClickRatePageviewResult {
  rageClickPageviewCount?: number | null;
  totalPageviews?: number | null;
  metricValue: number;
}

export interface ClickDistributionResult {
  zoneClickCount?: number | null;
  totalClicks?: number | null;
  metricValue: number;
}

export interface ClickRecurrenceResult {
  zoneClickCount?: number | null;
  totalPageviews?: number | null;
  metricValue: number;
}

export interface ExposureRateResult {
  zoneExposureCount?: number | null;
  totalPageviews?: number | null;
  metricValue: number;
}

export interface ScrollReachResult {
  sumScrollDepth?: number | null;
  totalPageviews?: number | null;
  metricValue: number;
}

export interface AttractivenessRateResult {
  exposedPageviewsWithClick?: number | null;
  exposedPageviews?: number | null;
  metricValue: number;
}

export interface RevenuePerClickResult {
  zoneRevenue?: number | null;
  sessionCount?: number | null;
  metricValue: number;
}

export type MetricResult =
  | ClickRateSessionResult
  | ClickRatePageviewResult
  | RageClickRateSessionResult
  | RageClickRatePageviewResult
  | ClickDistributionResult
  | ClickRecurrenceResult
  | ExposureRateResult
  | ScrollReachResult
  | AttractivenessRateResult
  | RevenuePerClickResult;

export interface ZoneMetrics {
  clickRateSession?: ClickRateSessionResult;
  clickRatePageview?: ClickRatePageviewResult;
  rageClickRateSession?: RageClickRateSessionResult;
  rageClickRatePageview?: RageClickRatePageviewResult;
  clickDistribution?: ClickDistributionResult;
  clickRecurrence?: ClickRecurrenceResult;
  exposureRate?: ExposureRateResult;
  scrollReach?: ScrollReachResult;
  attractivenessRate?: AttractivenessRateResult;
  revenuePerClick?: RevenuePerClickResult;
}

export interface ZoneMetric {
  selector: string;
  metrics: ZoneMetrics;
}

export type ZoneMetricsRequest = {
  metrics: MetricType[];
  freshness?: string;
  start: string;
  end: string;
  segments?: Segment[];
  eventFilters?: ZoningEventFilter[];
  parentZoneId?: string;
  zoneIds?: string[];
  allowQueryParams?: boolean;
} & (
  | {
      pageUrl: string;
      pageUrlOperator?: PageUrlOperator;
      pageGroupId?: undefined;
    }
  | { pageGroupId: string; pageUrl?: undefined; pageUrlOperator?: undefined }
);

export interface ZoneMetricsResponse {
  data?: Array<{
    zoneMetrics?: ZoneMetric[];
    segmentIndex?: number;
    scrollReach?: {
      sumScrollDepth: number;
      totalPageviews: number;
      metricValue: number;
    };
  }>;
}
