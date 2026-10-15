import { createSelectorEngine, generateSelector } from '@amplitude/element-selector';

import {
  buildParentZoneQueries,
  buildParentZoneQuery,
  DEFAULT_ALLOWLIST,
  filterTopLevelZones,
  getAllowedElementForZone,
  buildZoneMetricsMap,
  buildZoneMetricsMapClientSide,
  findMatchingZoneMetric,
  getMetricValue,
  getZoneEventCount,
  buildZoneMetricsRequest,
  getShadowDomHitTestOptions,
  resolveZoningSelectorConfig,
  MetricType,
  type Zone,
  type ZoningFlags,
} from '../../src';

import type { ZoningFixture } from './types';

const makeZone = (el: HTMLElement, id: string, hasContent = true): Zone => ({
  id,
  htmlElement: el,
  rect: new DOMRect(),
  isActive: true,
  percentage: 0.5,
  hasContent,
});

export const runCoreFixture = (fixture: ZoningFixture, doc: Document) => {
  const flags: ZoningFlags = {
    cssMatchAggregation: fixture.flags.cssMatchAggregation,
    shadowDom: fixture.flags.shadowDom,
  };

  const config = resolveZoningSelectorConfig(fixture.browserSDK, flags);
  const engine = config.enabled === false ? null : createSelectorEngine(config);
  const deps = { engine, config };
  const shadowOptions = getShadowDomHitTestOptions(config);

  const clickEl = doc.querySelector(fixture.clickTarget) as HTMLElement;
  if (!clickEl) {
    throw new Error(`clickTarget not found: ${fixture.clickTarget}`);
  }

  const selectorsSet = new Set(fixture.selectorsWithData);
  const allowed = getAllowedElementForZone(clickEl, selectorsSet, deps, shadowOptions);
  const targetEl = allowed ?? clickEl;
  const zoneId = generateSelector(targetEl, engine, config) || targetEl.id;

  const parentZone = makeZone(targetEl, zoneId, true);
  const savedZones = (fixture.savedZones ?? []).map((selector) => {
    const el = doc.querySelector(selector) as HTMLElement;
    return makeZone(el, selector, true);
  });
  const allZones = [parentZone, ...savedZones];

  const parentQuery = buildParentZoneQuery(
    parentZone,
    selectorsSet,
    DEFAULT_ALLOWLIST,
    fixture.metricType,
    deps,
    flags,
  );

  const topLevel = filterTopLevelZones(allZones);
  const parentQueries = buildParentZoneQueries(
    topLevel,
    fixture.selectorsWithData,
    DEFAULT_ALLOWLIST,
    fixture.metricType,
    deps,
    flags,
  );

  let matchedValue: number | null = null;
  let eventCount: number | null = null;
  if (fixture.initialResponse) {
    const map = buildZoneMetricsMap(fixture.initialResponse as Parameters<typeof buildZoneMetricsMap>[0], []);
    const clientMap =
      fixture.metricType === MetricType.CLICK_DISTRIBUTION || fixture.metricType === MetricType.CLICK_RECURRENCE
        ? buildZoneMetricsMapClientSide([...map.values()], parentQueries, fixture.metricType)
        : map;
    const matched = findMatchingZoneMetric(parentZone, clientMap);
    matchedValue = getMetricValue(matched, fixture.metricType);
    eventCount = getZoneEventCount(matched, fixture.metricType);
  }

  let requestBody: Record<string, unknown> | undefined;
  let requestEnabled: boolean | undefined;
  if (fixture.pageScope) {
    const pageScope = fixture.pageScope.pageGroupId
      ? { pageGroupId: fixture.pageScope.pageGroupId }
      : {
          pageUrl: fixture.pageScope.pageUrl ?? 'https://example.com/path',
          pageUrlOperator: fixture.pageScope.pageUrlOperator,
          allowQueryParams: fixture.pageScope.allowQueryParams,
        };
    const built = buildZoneMetricsRequest({
      metricType: fixture.metricType,
      pageScope,
      start: fixture.start ?? '20240101',
      end: fixture.end ?? '20240131',
      parentZoneId: fixture.parentZoneId,
      zoneIds: fixture.zoneIds,
    });
    requestBody = built.request as Record<string, unknown>;
    requestEnabled = built.enabled;
  }

  return {
    zoneId,
    config,
    allowedElementSelector: allowed ? generateSelector(allowed, engine, config) : null,
    parentQuery,
    parentQueries,
    topLevelZoneIds: topLevel.map((z) => z.id),
    matchedValue,
    eventCount,
    requestBody,
    requestEnabled,
  };
};
