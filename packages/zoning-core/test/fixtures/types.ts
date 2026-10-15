import type { ResolvedSelectorConfig } from '@amplitude/element-selector';

import type { MetricType, ParentZoneQueryConfig, ZoneMetricsRequest } from '../../src/types';

export interface ZoningParityFlags {
  cssMatchAggregation: boolean;
  shadowDom: boolean;
}

export interface ZoningFixtureExpected {
  allowedElementSelector?: string;
  parentQueries?: ParentZoneQueryConfig[] | null;
  matchedValue?: number | null;
  eventCount?: number | null;
  request?: Partial<ZoneMetricsRequest>;
  requestEnabled?: boolean;
  topLevelZoneIds?: string[];
}

export interface ZoningFixture {
  name: string;
  html: string;
  setup?: (doc: Document) => void;
  clickTarget: string;
  savedZones?: string[];
  selectorsWithData: string[];
  flags: ZoningParityFlags;
  browserSDK?: unknown;
  metricType: MetricType;
  pageScope?: {
    pageUrl?: string;
    pageUrlOperator?: 'is' | 'contains';
    allowQueryParams?: boolean;
    pageGroupId?: string;
  };
  start?: string;
  end?: string;
  parentZoneId?: string;
  zoneIds?: string[];
  initialResponse?: unknown;
  expected: ZoningFixtureExpected;
}

export interface ZoningFixtureRuntimeConfig {
  engine: import('@amplitude/element-selector').SelectorEngine | null;
  config: ResolvedSelectorConfig;
}
