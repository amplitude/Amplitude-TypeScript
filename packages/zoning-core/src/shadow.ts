import {
  composedParent,
  normalizeResolvedConfig,
  SHADOW_BOUNDARY_DELIMITER,
  type ResolvedSelectorConfig,
} from '@amplitude/element-selector';

/** Shadow hit-test + resolver options aligned with the SDK element-selector config. */
export interface ShadowDomHitTestOptions {
  shadowDomEnabled: boolean;
  maxShadowDomDepth: number;
}

/**
 * Effective shadow settings for zoning overlay hit testing, selector generation,
 * and delimited selector resolution.
 */
export const resolveZoningShadowDomConfig = (
  remoteConfig: ResolvedSelectorConfig,
  shadowRolloutEnabled: boolean,
): ResolvedSelectorConfig => {
  if (!shadowRolloutEnabled) {
    return { ...remoteConfig, shadowDomEnabled: false };
  }
  return remoteConfig;
};

export const getShadowDomHitTestOptions = (config: ResolvedSelectorConfig): ShadowDomHitTestOptions => {
  const { shadowDomEnabled, maxShadowDomDepth } = normalizeResolvedConfig(config);
  return { shadowDomEnabled, maxShadowDomDepth };
};

/** Shadow-boundary crossings from `el` up to the document. */
export const countShadowDomCrossings = (el: Element): number => {
  let crossings = 0;
  for (let node: Element | null = el; node !== null; node = composedParent(node)) {
    if (!node.parentElement && node.getRootNode() !== node.ownerDocument) {
      crossings += 1;
    }
  }
  return crossings;
};

/** Whether `el` is within the configured shadow pierce depth for zoning. */
export const elementWithinShadowDepthBudget = (el: HTMLElement, shadowOptions?: ShadowDomHitTestOptions): boolean => {
  if (!shadowOptions?.shadowDomEnabled) {
    return true;
  }
  return countShadowDomCrossings(el) <= shadowOptions.maxShadowDomDepth;
};

export const canEnterShadowRoot = (host: HTMLElement, shadowOptions?: ShadowDomHitTestOptions): boolean =>
  !!shadowOptions?.shadowDomEnabled &&
  !!host.shadowRoot &&
  countShadowDomCrossings(host) + 1 <= shadowOptions.maxShadowDomDepth;

/** `contains` across shadow boundaries (uses `composedParent`). */
export const composedContains = (ancestor: HTMLElement, descendant: HTMLElement): boolean => {
  if (ancestor === descendant) {
    return true;
  }
  let node: Element | null = descendant;
  while (node) {
    if (node === ancestor) {
      return true;
    }
    node = composedParent(node);
  }
  return false;
};

export const selectorRequiresShadowResolver = (selector: string): boolean =>
  selector.includes(SHADOW_BOUNDARY_DELIMITER);

export const selectorWithinShadowBudget = (selector: string, shadowOptions?: ShadowDomHitTestOptions): boolean => {
  if (!selectorRequiresShadowResolver(selector)) {
    return true;
  }
  if (!shadowOptions?.shadowDomEnabled) {
    return false;
  }
  const crossings = selector.split(SHADOW_BOUNDARY_DELIMITER).length - 1;
  return crossings <= shadowOptions.maxShadowDomDepth;
};

export const zoneSelectorCrossesShadowDom = (selector: string, shadowZoningEnabled: boolean): boolean =>
  shadowZoningEnabled && selectorRequiresShadowResolver(selector);
