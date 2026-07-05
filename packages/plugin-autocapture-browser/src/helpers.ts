/* eslint-disable no-restricted-globals */
import { ElementInteractionsOptions, ActionType, isUrlMatchAllowlist, getGlobalScope } from '@amplitude/analytics-core';
import { composedParent } from '@amplitude/element-selector';
import * as constants from './constants';

export type JSONValue = string | number | boolean | null | { [x: string]: JSONValue } | Array<JSONValue>;

const SENSITIVE_TAGS = ['input', 'select', 'textarea'];

export type shouldTrackEvent = (actionType: ActionType, element: Element) => boolean;

export const isElementPointerCursor = (element: Element, actionType: ActionType): boolean => {
  /* istanbul ignore next */
  const computedStyle = window?.getComputedStyle?.(element);
  /* istanbul ignore next */
  return computedStyle?.getPropertyValue('cursor') === 'pointer' && actionType === 'click';
};

export const isUrlAllowed = (autocaptureOptions: ElementInteractionsOptions): boolean => {
  const { pageUrlAllowlist, pageUrlExcludelist } = autocaptureOptions;

  // check if the URL is in the excludelist
  if (
    pageUrlExcludelist &&
    pageUrlExcludelist.length > 0 &&
    isUrlMatchAllowlist(window.location.href, pageUrlExcludelist as (string | RegExp)[])
  ) {
    return false;
  }

  // check if the URL is in the allow list
  if (!isUrlMatchAllowlist(window.location.href, pageUrlAllowlist)) {
    return false;
  }

  return true;
};

export const createShouldTrackEvent = (
  autocaptureOptions: ElementInteractionsOptions,
  allowlist: string[], // this can be any type of css selector allow list
): shouldTrackEvent => {
  return (actionType: ActionType, element: Element) => {
    const { shouldTrackEventResolver } = autocaptureOptions;

    /* istanbul ignore next */
    const tag = element?.tagName?.toLowerCase?.();
    // window, document, and Text nodes have no tag
    if (!tag) {
      return false;
    }

    if (shouldTrackEventResolver) {
      return shouldTrackEventResolver(actionType, element);
    }

    if (!isUrlAllowed(autocaptureOptions)) {
      return false;
    }

    /* istanbul ignore next */
    const elementType = String(element?.getAttribute('type')) || '';
    if (typeof elementType === 'string') {
      switch (elementType.toLowerCase()) {
        case 'hidden':
          return false;
        case 'password':
          return false;
      }
    }

    /* istanbul ignore if */
    if (allowlist) {
      const hasMatchAnyAllowedSelector = allowlist.some((selector) => !!element?.matches?.(selector));
      if (!hasMatchAnyAllowedSelector) {
        return false;
      }
    }

    switch (tag) {
      case 'input':
      case 'select':
      case 'textarea':
        return actionType === 'change' || actionType === 'click';
      default:
        return actionType === 'click';
    }
  };
};

export const isTextNode = (node: Node) => {
  return !!node && node.nodeType === 3;
};

export const isNonSensitiveElement = (element: Element) => {
  /* istanbul ignore next */
  const tag = element?.tagName?.toLowerCase?.();
  const isContentEditable =
    element instanceof HTMLElement ? element.getAttribute('contenteditable')?.toLowerCase() === 'true' : false;

  return !SENSITIVE_TAGS.includes(tag) && !isContentEditable;
};

/**
 * Collects redacted attribute names from element and ancestor elements with data-amp-mask-attributes
 * The 'id' and 'class' attributes cannot be redacted as they're critical for element identification
 * @param element - The target element to check for redaction attributes
 * @returns Set of attribute names that should be redacted
 */
/**
 * Parses a comma-separated string of attribute names and filters out protected attributes
 * @param attributeString - Comma-separated string of attribute names
 * @returns Array of valid attribute names, excluding 'id' and 'class'
 */
export const parseAttributesToMask = (attributeString: string | null): string[] => {
  return attributeString
    ? attributeString
        .split(',')
        .map((attr) => attr.trim())
        .filter((attr) => attr.length > 0 && attr !== 'id' && attr !== 'class') // Prevent 'id' and 'class' from being redacted as they're critical for element identification
    : [];
};

export const extractPrefixedAttributes = (
  attrs: { [key: string]: string },
  prefix: string,
): { [key: string]: string } => {
  return Object.entries(attrs).reduce((attributes: { [key: string]: string }, [attributeName, attributeValue]) => {
    if (attributeName.startsWith(prefix)) {
      const attributeKey = attributeName.replace(prefix, '');

      if (attributeKey) {
        attributes[attributeKey] = attributeValue || '';
      }
    }
    return attributes;
  }, {});
};

export const isEmpty = (value: unknown) => {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'object' && Object.keys(value).length === 0) ||
    (typeof value === 'string' && value.trim().length === 0)
  );
};

export const removeEmptyProperties = (properties: { [key: string]: unknown }): { [key: string]: unknown } => {
  return Object.keys(properties).reduce((filteredProperties: { [key: string]: unknown }, key) => {
    const value = properties[key];
    if (!isEmpty(value)) {
      filteredProperties[key] = value;
    }
    return filteredProperties;
  }, {});
};

export const getCurrentPageViewId = (): string | undefined => {
  try {
    const globalScope = getGlobalScope();
    /* istanbul ignore next */
    const raw = globalScope?.sessionStorage?.getItem(constants.PAGE_VIEW_SESSION_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as { pageViewId?: unknown };
    if (typeof parsed.pageViewId === 'string') {
      return parsed.pageViewId;
    }
  } catch {
    // ignore storage access or JSON errors
  }
  return undefined;
};

export const querySelectUniqueElements = (root: Element | Document, selectors: string[]): Element[] => {
  if (root && 'querySelectorAll' in root && typeof root.querySelectorAll === 'function') {
    const elementSet = selectors.reduce((elements: Set<Element>, selector) => {
      if (selector) {
        const selectedElements = Array.from(root.querySelectorAll(selector));
        selectedElements.forEach((element) => {
          elements.add(element);
        });
      }
      return elements;
    }, new Set<Element>());
    return Array.from(elementSet);
  }
  return [];
};

// Similar as element.closest, but works with multiple selectors.
//
// When `crossShadow` is true, the walk continues past the top of a shadow tree
// into the shadow host (via `composedParent`), bounded by `maxShadowDepth`
// boundary crossings. With the default `crossShadow = false`, behavior is
// byte-identical to the prior `parentElement`-only recursion: the walk stops at
// the top of the element's own tree.
export const getClosestElement = (
  element: Element | null,
  selectors: string[],
  crossShadow = false,
  maxShadowDepth = 0,
): Element | null => {
  let current: Element | null = element;
  let crossings = 0;
  while (current) {
    /* istanbul ignore next */
    if (selectors.some((selector) => current?.matches?.(selector))) {
      return current;
    }
    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }
    // At the top of the current tree. Only cross the shadow boundary when
    // enabled, still within budget, and the node actually supports the composed
    // walk. With shadow piercing on, `element` is the event's
    // `composedPath()[0]`, which can be an exotic node (e.g. `window`) lacking
    // `getRootNode` — this guard degrades gracefully rather than throwing. Any
    // other throw is contained by the caller's error boundary (enrichment).
    if (crossShadow && crossings < maxShadowDepth && typeof current.getRootNode === 'function') {
      const host = composedParent(current);
      if (host && host !== current) {
        crossings += 1;
        current = host;
        continue;
      }
    }
    return null;
  }
  return null;
};

/**
 * Cost bound on shadow-tree traversal. A composed DOM can't cycle, so this only
 * caps a synchronous DFS (run inside a MutationObserver callback) on a
 * pathologically large tree. Mirrors `MAX_WALK_ITERATIONS` in
 * `element-selector/src/helpers/shadow.ts`.
 */
export const MAX_SHADOW_TRAVERSAL_NODES = 50000;

/**
 * Collect the OPEN shadow roots within `root`'s composed subtree (its own light
 * children and any nested shadow trees), each paired with how many shadow
 * boundary crossings deep it sits relative to `root` (1-based). Bounded by
 * `maxShadowDepth` crossings and by `MAX_SHADOW_TRAVERSAL_NODES` total nodes.
 * Closed roots are invisible (`el.shadowRoot` is null) and therefore skipped.
 * Used to fan out MutationObservers and to pierce exposure discovery.
 */
export const collectOpenShadowRoots = (
  root: Element,
  maxShadowDepth: number,
): Array<{ root: ShadowRoot; depth: number }> => {
  const found: Array<{ root: ShadowRoot; depth: number }> = [];
  if (maxShadowDepth <= 0) {
    return found;
  }
  // Iterative DFS over [element, crossingsFromRoot], capped to bound cost.
  const stack: Array<[Element, number]> = [[root, 0]];
  let visited = 0;
  while (stack.length && visited < MAX_SHADOW_TRAVERSAL_NODES) {
    visited += 1;
    const [el, depth] = stack.pop() as [Element, number];
    const shadowRoot = el.shadowRoot;
    if (shadowRoot && depth + 1 <= maxShadowDepth) {
      found.push({ root: shadowRoot, depth: depth + 1 });
      // Shadow content sits one crossing deeper.
      Array.from(shadowRoot.children).forEach((child) => stack.push([child, depth + 1]));
    }
    // Light-DOM children stay at the same crossing depth.
    Array.from(el.children).forEach((child) => stack.push([child, depth]));
  }
  return found;
};

/**
 * Like `querySelectUniqueElements` for a single joined selector, but pierces
 * open shadow roots up to `maxShadowDepth` crossings. With `maxShadowDepth = 0`
 * this is a plain light-DOM `querySelectorAll`, so the off path is unchanged.
 *
 * `querySelectorAll` can throw a `SyntaxError` on a malformed `cssSelectorAllowlist`
 * entry; callers run inside an error boundary (exposure observable / setup) that
 * contains it, so this stays a plain query.
 */
export const querySelectorAllDeep = (
  root: Element | Document,
  selectorString: string,
  maxShadowDepth = 0,
): Element[] => {
  const out: Element[] = [];
  if (!selectorString) {
    return out;
  }
  root.querySelectorAll(selectorString).forEach((el) => out.push(el));
  if (maxShadowDepth > 0) {
    const start = root instanceof Document ? root.documentElement : root;
    /* istanbul ignore else */
    if (start) {
      collectOpenShadowRoots(start, maxShadowDepth).forEach(({ root: shadowRoot }) => {
        shadowRoot.querySelectorAll(selectorString).forEach((el) => out.push(el));
      });
    }
  }
  return out;
};

export const asyncLoadScript = (url: string) => {
  return new Promise((resolve, reject) => {
    try {
      const scriptElement = document.createElement('script');
      scriptElement.type = 'text/javascript';
      scriptElement.async = true;
      scriptElement.src = url;
      scriptElement.addEventListener(
        'load',
        () => {
          resolve({ status: true });
        },
        { once: true },
      );
      scriptElement.addEventListener('error', () => {
        reject({
          status: false,
          message: `Failed to load the script ${url}`,
        });
      });
      /* istanbul ignore next */
      document.head?.appendChild(scriptElement);
    } catch (error) {
      /* istanbul ignore next */
      reject(error);
    }
  });
};

export function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const filterOutNonTrackableEvents = (event: ElementBasedTimestampedEvent<ElementBasedEvent>): boolean => {
  // Filter out changeEvent events with no target
  // This could happen when change events are triggered programmatically
  if (event.event.target === null || !event.closestTrackedAncestor) {
    return false;
  }

  return true;
};

export type AutoCaptureOptionsWithDefaults = Required<
  Pick<ElementInteractionsOptions, 'debounceTime' | 'cssSelectorAllowlist' | 'actionClickAllowlist'>
> &
  ElementInteractionsOptions;

// Base TimestampedEvent type
export type BaseTimestampedEvent<T> = {
  event: T;
  timestamp: number;
  type: 'rage' | 'click' | 'change' | 'error' | 'navigate' | 'mutation';
};

// Specific types for events with targetElementProperties
export type ElementBasedEvent = MouseEvent | Event;
export type ElementBasedTimestampedEvent<T> = BaseTimestampedEvent<T> & {
  event: MouseEvent | Event;
  type: 'click' | 'change';
  closestTrackedAncestor: Element;
  targetElementProperties: Record<string, any>;
};

export type evaluateTriggersFn = (
  event: ElementBasedTimestampedEvent<ElementBasedEvent>,
) => ElementBasedTimestampedEvent<ElementBasedEvent>;

// Union type for all possible TimestampedEvents
export type TimestampedEvent<T> = BaseTimestampedEvent<T> | ElementBasedTimestampedEvent<T>;

// Type predicate
export function isElementBasedEvent<T>(event: BaseTimestampedEvent<T>): event is ElementBasedTimestampedEvent<T> {
  return event.type === 'click' || event.type === 'change';
}

export interface NavigateEvent extends Event {
  readonly navigationType: 'reload' | 'push' | 'replace' | 'traverse';
  readonly destination: {
    readonly url: string;
    readonly key: string | null;
    readonly id: string | null;
    readonly index: number;
    readonly sameDocument: boolean;

    getState(): any;
  };
  readonly canIntercept: boolean;
  readonly userInitiated: boolean;
  readonly hashChange: boolean;
  readonly signal: AbortSignal;
  readonly formData: FormData | null;
  readonly downloadRequest: string | null;
  readonly info: any;
  readonly hasUAVisualTransition: boolean;
  /** @see https://github.com/WICG/navigation-api/pull/264 */
  readonly sourceElement: Element | null;

  scroll(): void;
}

export enum MouseButton {
  LEFT_OR_TOUCH_CONTACT = 0,
  MIDDLE = 1,
  RIGHT = 2,
}
