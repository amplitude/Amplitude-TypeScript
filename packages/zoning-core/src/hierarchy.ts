import { collectOpenShadowRoots, generateSelector, resolveSelector } from '@amplitude/element-selector';

import type { ZoningCoreDeps } from './deps';
import { notifyError } from './deps';
import type { ZoningFlags } from './flags';
import {
  composedContains,
  countShadowDomCrossings,
  elementWithinShadowDepthBudget,
  getShadowDomHitTestOptions,
  selectorRequiresShadowResolver,
  selectorWithinShadowBudget,
} from './shadow';
import { MetricType, type ParentZoneQueryConfig, type Zone } from './types';
import { isSelectorTooGeneric } from './metrics';

export const DEFAULT_ALLOWLIST: string[] = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'video',
  'audio',
  '[contenteditable="true" i]',
  '[data-amp-default-track]',
  '.amp-default-track',
  '[role="button"]',
];

const getCssAliasesForElement = (element: Element, selectorsWithData: Set<string>, deps: ZoningCoreDeps): string[] => {
  const shadowOptions = getShadowDomHitTestOptions(deps.config);
  const aliases: string[] = [];
  selectorsWithData.forEach((candidateSelector) => {
    if (isSelectorTooGeneric(candidateSelector)) {
      return;
    }
    try {
      if (selectorRequiresShadowResolver(candidateSelector)) {
        if (
          selectorWithinShadowBudget(candidateSelector, shadowOptions) &&
          resolveSelector(element.ownerDocument, candidateSelector) === element
        ) {
          aliases.push(candidateSelector);
        }
      } else if (element.matches(candidateSelector)) {
        aliases.push(candidateSelector);
      }
    } catch {
      // Invalid CSS selector syntax — skip
    }
  });
  return aliases;
};

export const getAllChildrenWithContent = (
  parentElement: HTMLElement,
  selectorsWithData: Set<string>,
  allowlist: string[],
  deps: ZoningCoreDeps,
  flags: ZoningFlags,
): string[] => {
  const aliasesByDescendant = new Map<Element, string[]>();
  const shadowOptions = getShadowDomHitTestOptions(deps.config);
  const isCssMatchAggregationEnabled = flags.cssMatchAggregation;

  const searchRoots: ParentNode[] = [parentElement];
  if (shadowOptions.shadowDomEnabled) {
    const remainingDepth = shadowOptions.maxShadowDomDepth - countShadowDomCrossings(parentElement);
    collectOpenShadowRoots(parentElement, remainingDepth).forEach(({ root }) => searchRoots.push(root));
  }

  const registerMatch = (el: Element, isAliasCandidate: boolean, selector: string) => {
    if (el === parentElement || !composedContains(parentElement, el as HTMLElement)) {
      return;
    }

    let aliases = aliasesByDescendant.get(el);
    if (!aliases) {
      aliases = [];
      aliasesByDescendant.set(el, aliases);
    }
    if (isAliasCandidate) {
      aliases.push(selector);
    }
  };

  const sweep = (selector: string, isAliasCandidate: boolean): void => {
    if (selectorRequiresShadowResolver(selector)) {
      if (!selectorWithinShadowBudget(selector, shadowOptions)) {
        return;
      }
      try {
        const resolved = resolveSelector(parentElement.ownerDocument, selector);
        if (resolved && elementWithinShadowDepthBudget(resolved as HTMLElement, shadowOptions)) {
          registerMatch(resolved, isAliasCandidate, selector);
        }
      } catch (error) {
        notifyError(deps, error, {
          component: 'getAllChildrenWithContent',
          extra: { selector },
        });
      }
      return;
    }

    for (const root of searchRoots) {
      let elements: NodeListOf<Element>;
      try {
        elements = root.querySelectorAll(selector);
      } catch (error) {
        notifyError(deps, error, {
          component: 'getAllChildrenWithContent',
          extra: { selector },
        });
        return;
      }

      elements.forEach((el) => {
        registerMatch(el, isAliasCandidate, selector);
      });
    }
  };

  selectorsWithData.forEach((selector) => {
    sweep(selector, isCssMatchAggregationEnabled && !isSelectorTooGeneric(selector));
  });

  allowlist.forEach((selector) => sweep(selector, false));

  const childrenWithContent = new Set<string>();
  aliasesByDescendant.forEach((aliases, el) => {
    const childSelector = generateSelector(el, deps.engine, deps.config);
    if (childSelector) {
      childrenWithContent.add(childSelector);
    }

    aliases.forEach((alias) => childrenWithContent.add(alias));
  });

  return Array.from(childrenWithContent);
};

export const buildZoneIdList = (
  parentZoneId: string,
  parentHasContent: boolean,
  childrenWithContent: string[],
): string[] => {
  const zoneIds: string[] = [];

  if (!parentHasContent) {
    zoneIds.push(...childrenWithContent);
  } else {
    zoneIds.push(parentZoneId);
    zoneIds.push(...childrenWithContent);
  }

  return zoneIds.sort();
};

export const buildParentZoneQuery = (
  parentZone: Zone,
  selectorsWithData: Set<string>,
  allowlist: string[],
  metricType: MetricType,
  deps: ZoningCoreDeps,
  flags: ZoningFlags,
): ParentZoneQueryConfig | null => {
  const isCssMatchAggregationEnabled = flags.cssMatchAggregation;

  const childrenWithContent = getAllChildrenWithContent(
    parentZone.htmlElement,
    selectorsWithData,
    allowlist,
    deps,
    flags,
  );

  if (isCssMatchAggregationEnabled) {
    const selfAliases = getCssAliasesForElement(parentZone.htmlElement, selectorsWithData, deps);
    const zoneIds = Array.from(new Set([parentZone.id, ...selfAliases, ...childrenWithContent])).sort();

    return {
      parentZoneId: parentZone.id,
      zoneIds,
    };
  }

  const parentHasContent = parentZone.hasContent ?? false;
  const shouldQuery = childrenWithContent.length > 0;

  if (metricType === MetricType.CLICK_RECURRENCE && !shouldQuery) {
    return {
      parentZoneId: parentZone.id,
      zoneIds: [parentZone.id],
    };
  }

  if (!shouldQuery) {
    return null;
  }

  const zoneIds = buildZoneIdList(parentZone.id, parentHasContent, childrenWithContent);

  return {
    parentZoneId: parentZone.id,
    zoneIds,
  };
};

export const filterTopLevelZones = (zones: Zone[]): Zone[] => {
  const topLevelZones = zones.filter((zone) => {
    const isDescendant = zones.some((potentialAncestor) => {
      if (potentialAncestor.id === zone.id) {
        return false;
      }
      return composedContains(potentialAncestor.htmlElement, zone.htmlElement);
    });
    return !isDescendant;
  });
  const seen = new Set<string>();

  return topLevelZones.filter((zone) => {
    if (seen.has(zone.id)) {
      return false;
    }
    seen.add(zone.id);
    return true;
  });
};

interface MemoizedParentZoneQuery {
  zoneId: string;
  hasContent: boolean;
  selectorsWithData: string[];
  allowlist: string[];
  metricType: MetricType;
  engine: ZoningCoreDeps['engine'];
  config: ZoningCoreDeps['config'];
  result: ParentZoneQueryConfig | null;
}

const memoizedParentZoneQueries = new WeakMap<HTMLElement, MemoizedParentZoneQuery>();

export const buildParentZoneQueries = (
  topMostParentZones: Zone[],
  selectorsWithData: string[],
  allowlist: string[],
  metricType: MetricType,
  deps: ZoningCoreDeps,
  flags: ZoningFlags,
): ParentZoneQueryConfig[] => {
  const isCssMatchAggregationEnabled = flags.cssMatchAggregation;
  let selectorsSet: Set<string> | null = null;
  const queries: ParentZoneQueryConfig[] = [];

  for (const zone of topMostParentZones) {
    const hasContent = zone.hasContent ?? false;
    const memoized = isCssMatchAggregationEnabled ? memoizedParentZoneQueries.get(zone.htmlElement) : undefined;

    let result: ParentZoneQueryConfig | null;
    if (
      memoized &&
      memoized.zoneId === zone.id &&
      memoized.hasContent === hasContent &&
      memoized.selectorsWithData === selectorsWithData &&
      memoized.allowlist === allowlist &&
      memoized.metricType === metricType &&
      memoized.engine === deps.engine &&
      memoized.config === deps.config
    ) {
      result = memoized.result;
    } else {
      selectorsSet ??= new Set(selectorsWithData);
      result = buildParentZoneQuery(zone, selectorsSet, allowlist, metricType, deps, flags);
      if (isCssMatchAggregationEnabled) {
        memoizedParentZoneQueries.set(zone.htmlElement, {
          zoneId: zone.id,
          hasContent,
          selectorsWithData,
          allowlist,
          metricType,
          engine: deps.engine,
          config: deps.config,
          result,
        });
      }
    }

    if (result) {
      queries.push(result);
    }
  }

  return queries;
};
