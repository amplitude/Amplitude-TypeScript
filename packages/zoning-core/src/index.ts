export const PACKAGE_NAME = '@amplitude/zoning-core';

export type { ZoningCoreDeps } from './deps';
export { notifyError } from './deps';

export type { ZoningFlags } from './flags';
export { resolveZoningFlags } from './flags';

export {
  mergeElementInteractionsShadowConfig,
  resolveZoningSelectorConfig,
  type BrowserSdkAutocaptureConfig,
} from './selector-config';

export type { ShadowDomHitTestOptions } from './shadow';
export {
  resolveZoningShadowDomConfig,
  getShadowDomHitTestOptions,
  countShadowDomCrossings,
  elementWithinShadowDepthBudget,
  canEnterShadowRoot,
  composedContains,
  selectorRequiresShadowResolver,
  selectorWithinShadowBudget,
  zoneSelectorCrossesShadowDom,
} from './shadow';

export {
  stripQueryAndHash,
  getPageUrlFromScope,
  isSinglePagePageScope,
  getPageUrlOperatorFromScope,
  getAllowQueryParamsFromScope,
  getEffectivePageUrlFromScope,
  resolvePageScope,
  areUrlsEquivalent,
  type SinglePagePageScope,
} from './page-scope';

export {
  DEFAULT_ALLOWLIST,
  getAllChildrenWithContent,
  buildZoneIdList,
  buildParentZoneQuery,
  filterTopLevelZones,
  buildParentZoneQueries,
} from './hierarchy';

export {
  isValidSelector,
  getAllowedElementForZone,
  findRefinementAncestor,
  findRefinementDescendant,
  getElementFromPoint,
  canResolveZoneSelector,
  resolveZoneSelector,
  isElementVisible,
} from './elements';

export {
  getMetricKey,
  getMetricValue,
  getZoneEventCount,
  extractZoneMetrics,
  extractZoneSelectors,
  buildZoneMetricsMap,
  buildZoneMetricsMapClientSide,
  findMatchingZoneMetric,
  isSelectorTooGeneric,
  getMetricRange,
  getZoneColor,
} from './metrics';

export {
  buildZoneMetricsRequest,
  type BuildZoneMetricsRequestInput,
  type BuildZoneMetricsRequestResult,
} from './request';

export {
  MetricType,
  PAGE_URL_OPERATOR_CONTAINS,
  PAGE_URL_OPERATOR_EXACT,
  type Segment,
  type Zone,
  type ParentZoneQueryConfig,
  type PageScope,
  type PageUrlOperator,
  type ZoningEventFilter,
  type ZoneMetric,
  type ZoneMetrics,
  type ZoneMetricsRequest,
  type ZoneMetricsResponse,
  type MetricResult,
} from './types';
