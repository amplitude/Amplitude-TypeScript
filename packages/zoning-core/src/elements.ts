import { composedParent, generateSelector, resolveSelector } from '@amplitude/element-selector';

import type { ZoningCoreDeps } from './deps';
import { notifyError } from './deps';
import {
  canEnterShadowRoot,
  elementWithinShadowDepthBudget,
  selectorRequiresShadowResolver,
  selectorWithinShadowBudget,
  type ShadowDomHitTestOptions,
} from './shadow';
import { DEFAULT_ALLOWLIST } from './hierarchy';

const VALID_SELECTOR_PATTERN = /^[a-zA-Z0-9-_#,.\s:()><+[\]="'~]*$/;

export const isValidSelector = (selector: string): boolean => {
  if (!selector || typeof selector !== 'string' || selector.length === 0) {
    return false;
  }

  const result = CSS.supports(`selector(${selector})`);
  if (result !== undefined) {
    return result;
  }

  return VALID_SELECTOR_PATTERN.test(selector);
};

const createUniqueSelector = (el: HTMLElement, deps: ZoningCoreDeps): string | null =>
  generateSelector(el, deps.engine, deps.config) || null;

const MAX_PARENT_LEVELS = 10;
const MAX_DESCENDANT_DEPTH = 10;
const MAX_CHILDREN_PER_LEVEL = 15;

const isElementAllowed = (
  element: HTMLElement,
  allSelectorsSet: Set<string>,
  cssPathCache: Map<HTMLElement, string>,
  deps: ZoningCoreDeps,
  shadowOptions?: ShadowDomHitTestOptions,
): boolean => {
  const getCssPath = (el: HTMLElement): string | null => {
    const cachedValue = cssPathCache.get(el);

    if (cachedValue) {
      return cachedValue;
    }

    const selector = createUniqueSelector(el, deps);

    if (selector) {
      cssPathCache.set(el, selector);
    }

    return selector;
  };

  const matchesDirectly = (el: HTMLElement): boolean => {
    for (const selector of DEFAULT_ALLOWLIST) {
      try {
        if (el.matches(selector)) return true;
      } catch {
        // Invalid selector, skip
      }
    }
    const selector = getCssPath(el);
    return !!selector && allSelectorsSet.has(selector);
  };

  if (matchesDirectly(element)) {
    return true;
  }

  const visitInspectableChildren = (el: HTMLElement, visit: (child: HTMLElement) => boolean): boolean => {
    const limit = Math.min(el.children.length, MAX_CHILDREN_PER_LEVEL);
    for (let i = 0; i < limit; i++) {
      const child = el.children[i] as HTMLElement;
      if (visit(child)) {
        return true;
      }
    }
    if (el.shadowRoot && canEnterShadowRoot(el, shadowOptions)) {
      const srLimit = Math.min(el.shadowRoot.children.length, MAX_CHILDREN_PER_LEVEL);
      for (let i = 0; i < srLimit; i++) {
        const child = el.shadowRoot.children[i] as HTMLElement;
        if (visit(child)) {
          return true;
        }
      }
    }
    return false;
  };

  const hasAllowedDescendant = (el: HTMLElement, depth: number): boolean => {
    if (depth <= 0) {
      return false;
    }
    return visitInspectableChildren(el, (child) => {
      if (matchesDirectly(child)) {
        return true;
      }
      return hasAllowedDescendant(child, depth - 1);
    });
  };

  return hasAllowedDescendant(element, MAX_DESCENDANT_DEPTH);
};

const isDocumentRoot = (el: HTMLElement): boolean =>
  el === el.ownerDocument.body || el === el.ownerDocument.documentElement;

export const getAllowedElementForZone = (
  element: HTMLElement,
  allSelectorsSet: Set<string>,
  deps: ZoningCoreDeps,
  shadowOptions?: ShadowDomHitTestOptions,
): HTMLElement | null => {
  const shadowDomEnabled = shadowOptions?.shadowDomEnabled === true;

  if (isDocumentRoot(element)) {
    return null;
  }

  const cssPathCache = new Map<HTMLElement, string>();

  if (isElementAllowed(element, allSelectorsSet, cssPathCache, deps, shadowOptions)) {
    return element;
  }

  let parent = shadowDomEnabled ? (composedParent(element) as HTMLElement | null) : element.parentElement;
  let levelsUp = 0;

  while (parent && !isDocumentRoot(parent) && levelsUp < MAX_PARENT_LEVELS) {
    if (isElementAllowed(parent, allSelectorsSet, cssPathCache, deps, shadowOptions)) {
      return parent;
    }
    parent = shadowDomEnabled ? (composedParent(parent) as HTMLElement | null) : parent.parentElement;
    levelsUp++;
  }

  return null;
};

const hasNonZeroArea = (el: HTMLElement): boolean => {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

export const findRefinementAncestor = (
  element: HTMLElement,
  shadowOptions?: ShadowDomHitTestOptions,
): HTMLElement | null => {
  const shadowDomEnabled = shadowOptions?.shadowDomEnabled === true;
  const html = element.ownerDocument.documentElement;
  let parent = shadowDomEnabled ? (composedParent(element) as HTMLElement | null) : element.parentElement;
  while (parent && parent !== html) {
    if (hasNonZeroArea(parent) && elementWithinShadowDepthBudget(parent, shadowOptions)) {
      return parent;
    }
    parent = shadowDomEnabled ? (composedParent(parent) as HTMLElement | null) : parent.parentElement;
  }
  return null;
};

export const findRefinementDescendant = (
  element: HTMLElement,
  shadowOptions?: ShadowDomHitTestOptions,
): HTMLElement | null => {
  const shadowDomEnabled = shadowOptions?.shadowDomEnabled === true;

  const pickVisibleWithinBudget = (start: HTMLElement | null): HTMLElement | null => {
    let child = start;
    while (child) {
      if (hasNonZeroArea(child) && elementWithinShadowDepthBudget(child, shadowOptions)) {
        return child;
      }
      child = child.nextElementSibling as HTMLElement | null;
    }
    return null;
  };

  if (shadowDomEnabled && element.shadowRoot) {
    const fromShadow = pickVisibleWithinBudget(element.shadowRoot.firstElementChild as HTMLElement | null);
    if (fromShadow) {
      return fromShadow;
    }
  }

  return pickVisibleWithinBudget(element.firstElementChild as HTMLElement | null);
};

const pickMeaningfulElementAtPoint = (elements: HTMLElement[]): HTMLElement | null =>
  elements.find((el) => el.tagName !== 'HTML' && el.tagName !== 'BODY') ?? null;

type CheckVisibilityElement = HTMLElement & {
  checkVisibility?: (options?: {
    checkOpacity?: boolean;
    checkVisibilityCSS?: boolean;
    contentVisibilityAuto?: boolean;
  }) => boolean;
};

export const isElementVisible = (element: HTMLElement): boolean => {
  if (!element.isConnected) {
    return false;
  }
  const checkVisibility = (element as CheckVisibilityElement).checkVisibility;
  if (checkVisibility) {
    return checkVisibility.call(element, {
      checkOpacity: true,
      checkVisibilityCSS: true,
      contentVisibilityAuto: true,
    });
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const pierceOpenShadowAtPoint = (host: HTMLElement, x: number, y: number, maxDepth: number): HTMLElement => {
  let element = host;
  let depth = 0;
  while (depth < maxDepth && element.shadowRoot) {
    const innerStack = element.shadowRoot.elementsFromPoint(x, y) as HTMLElement[];
    const inner = pickMeaningfulElementAtPoint(innerStack);
    if (!inner) {
      break;
    }
    element = inner;
    depth += 1;
  }
  return element;
};

export const getElementFromPoint = (
  x: number,
  y: number,
  doc: Document,
  shadowOptions?: ShadowDomHitTestOptions,
): HTMLElement | null => {
  const stack = doc.elementsFromPoint(x, y) as HTMLElement[];

  if (!shadowOptions?.shadowDomEnabled) {
    return pickMeaningfulElementAtPoint(stack);
  }

  const top = pickMeaningfulElementAtPoint(stack);
  if (!top) {
    return null;
  }

  return pierceOpenShadowAtPoint(top, x, y, shadowOptions.maxShadowDomDepth);
};

export const canResolveZoneSelector = (selector: string, shadowOptions: ShadowDomHitTestOptions): boolean => {
  if (!selector || typeof selector !== 'string') {
    return false;
  }
  if (selectorRequiresShadowResolver(selector)) {
    return selectorWithinShadowBudget(selector, shadowOptions);
  }
  return isValidSelector(selector);
};

export const resolveZoneSelector = (
  root: Document,
  selector: string,
  shadowOptions: ShadowDomHitTestOptions,
  deps?: ZoningCoreDeps,
): Element | null => {
  if (!selector || typeof selector !== 'string') {
    return null;
  }
  try {
    if (selectorRequiresShadowResolver(selector)) {
      return selectorWithinShadowBudget(selector, shadowOptions) ? resolveSelector(root, selector) : null;
    }
    return root.querySelector(selector);
  } catch (error) {
    if (deps) {
      notifyError(deps, error, {
        component: 'resolveZoneSelector',
        extra: { selector },
      });
    }
    return null;
  }
};
