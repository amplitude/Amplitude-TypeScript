/* eslint-disable no-restricted-globals */
import {
  ElementInteractionsOptions,
  ActionType,
  isUrlMatchAllowlist,
  getDecodeURI,
  getGlobalScope,
} from '@amplitude/analytics-core';
import { collectOpenShadowRoots, segmentWalk, walkComposedAncestors } from '@amplitude/element-selector';
import { SHADOW_OFF, type ShadowMode } from './shadow-mode';
import {
  AMPLITUDE_EVENT_PROP_ELEMENT_CLICK_CELL,
  AMPLITUDE_EVENT_PROP_ELEMENT_CLICK_CELL_MAX_PER_AXIS,
  AMPLITUDE_EVENT_PROP_ELEMENT_CLICK_CELL_MIN_SIZE,
  AMPLITUDE_EVENT_PROP_ELEMENT_HEIGHT,
  AMPLITUDE_EVENT_PROP_ELEMENT_WIDTH,
  AMPLITUDE_EVENT_PROP_PAGE_X,
  AMPLITUDE_EVENT_PROP_PAGE_Y,
  DEFAULT_CLICK_CELL_MAX_PER_AXIS,
  DEFAULT_CLICK_CELL_MIN_SIZE_PX,
} from './constants';

export type JSONValue = string | number | boolean | null | { [x: string]: JSONValue } | Array<JSONValue>;

const SENSITIVE_TAGS = ['input', 'select', 'textarea'];

export type shouldTrackEvent = (actionType: ActionType, element: Element) => boolean;

export const isElementPointerCursor = (element: EventTarget | null, actionType: ActionType): boolean => {
  // DOM events can target Document, Window, or Text nodes as well as elements.
  if (actionType !== 'click' || !(element instanceof Element)) {
    return false;
  }
  /* istanbul ignore next */
  const computedStyle = window?.getComputedStyle?.(element);
  /* istanbul ignore next */
  return computedStyle?.getPropertyValue('cursor') === 'pointer';
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

/**
 * True when `element` is effectively editable. Editability is inherited: the nearest
 * ancestor with a `contenteditable` attribute wins. Any value other than `"false"`
 * (e.g. `""`, `"true"`, `"plaintext-only"`) is editable, so a nested button, span, or
 * heading inside an editing host is editable unless a closer `contenteditable="false"`
 * boundary opts that subtree out.
 *
 * The walk stays on `parentElement`, which stops at a shadow root. Editability does
 * not inherit across shadow boundaries.
 */
export const isContentEditableElement = (element: Element): boolean => {
  if (!(element instanceof HTMLElement)) return false;
  const contentEditable = element.getAttribute('contenteditable');
  if (contentEditable === null) {
    return false;
  }
  return contentEditable.toLowerCase() !== 'false';
};

export const isElementWithinContentEditableElement = (element: Element): boolean => {
  if (isContentEditableElement(element)) return true;
  const closestContentEditable = element.closest('[contenteditable]');
  return closestContentEditable ? isContentEditableElement(closestContentEditable) : false;
};

export const isNonSensitiveElement = (element: Element) => {
  /* istanbul ignore next */
  const tag = element?.tagName?.toLowerCase?.();

  return !SENSITIVE_TAGS.includes(tag) && !isContentEditableElement(element);
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

export { getCurrentPageViewId } from '@amplitude/analytics-core';

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
// Top-level dispatch: the light-DOM path is the pre-shadow implementation;
// shadow piercing is a separate walk.
export const getClosestElement = (
  element: Element | null,
  selectors: string[],
  shadow: ShadowMode = SHADOW_OFF,
): Element | null => {
  if (shadow.enabled) {
    return getClosestElementInShadow(element, selectors, shadow.maxDepth);
  }
  return getClosestElementLight(element, selectors);
};

/** Pre-shadow behavior: `parentElement` only, stops at the tree boundary. */
const getClosestElementLight = (element: Element | null, selectors: string[]): Element | null => {
  if (!element) {
    return null;
  }
  /* istanbul ignore next */
  if (selectors.some((selector) => element?.matches?.(selector))) {
    return element;
  }
  /* istanbul ignore next */
  return getClosestElementLight(element?.parentElement, selectors);
};

/** Shadow path: composed ancestor walk with a crossing budget. */
const getClosestElementInShadow = (element: Element | null, selectors: string[], maxDepth: number): Element | null => {
  if (!element) {
    return null;
  }
  for (const current of walkComposedAncestors(element, maxDepth)) {
    /* istanbul ignore next */
    if (selectors.some((selector) => current?.matches?.(selector))) {
      return current;
    }
  }
  return null;
};

/**
 * Like `querySelectUniqueElements` for a single joined selector, but also
 * queries open shadow roots up to `shadow.maxDepth` crossings. With
 * `SHADOW_OFF` this is a plain `querySelectorAll` on `root`.
 */
export const querySelectorAllDeep = (
  root: Element | Document,
  selectorString: string,
  shadow: ShadowMode = SHADOW_OFF,
): Element[] =>
  shadow.enabled
    ? querySelectorAllDeepInShadow(root, selectorString, shadow.maxDepth)
    : querySelectorAllDeepLight(root, selectorString);

const querySelectorAllDeepLight = (root: Element | Document, selectorString: string): Element[] => {
  const out: Element[] = [];
  if (!selectorString) {
    return out;
  }
  root.querySelectorAll(selectorString).forEach((el) => out.push(el));
  return out;
};

const querySelectorAllDeepInShadow = (
  root: Element | Document,
  selectorString: string,
  maxDepth: number,
): Element[] => {
  const out = querySelectorAllDeepLight(root, selectorString);
  // `document.documentElement` is typed nullable (e.g. before parsing completes).
  // Shadow DFS needs an Element anchor; light-DOM matches were already collected above.
  const start: Element | null = root instanceof Document ? root.documentElement : root;
  if (!start) {
    return out;
  }
  collectOpenShadowRoots(start, maxDepth).forEach(({ root: shadowRoot }) => {
    shadowRoot.querySelectorAll(selectorString).forEach((el) => out.push(el));
  });
  return out;
};

/**
 * The element an event originated from. Shadow DOM retargets `event.target` to
 * the shadow host when piercing is on; otherwise `event.target` is returned as-is.
 *
 * When piercing is enabled, the composed path is capped at `shadow.maxDepth`
 * shadow-boundary crossings — matching selector generation and observer indexing.
 * Clicks deeper than the budget resolve to the outermost in-budget shadow host.
 */
export const resolveEventTarget = (event: Event, shadow: ShadowMode = SHADOW_OFF): EventTarget | null => {
  if (!shadow.enabled) {
    return event.target;
  }
  const path = event.composedPath?.();
  const fallback = event.target ?? null;
  if (!path || path.length === 0) {
    return fallback;
  }
  const innermost = path[0];
  if (!(innermost instanceof Element)) {
    return innermost ?? fallback;
  }

  const { segments, truncated } = segmentWalk(innermost, shadow.maxDepth);
  if (truncated && segments.length > 0) {
    return segments[segments.length - 1].target;
  }
  return innermost;
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

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && isFinite(value);

/**
 * Whether a click came from a pointer. Keyboard activations and programmatic
 * `element.click()` calls dispatch a click with `detail === 0`, and plain
 * `Event`s have no `detail`; neither has a real pointer position.
 */
const isPointerClick = (event: Event | MouseEvent | null | undefined): event is MouseEvent =>
  !!event && typeof (event as MouseEvent).detail === 'number' && (event as MouseEvent).detail !== 0;

/**
 * Returns the pointer's page coordinates for a click event, keyed by the
 * `[Amplitude] Page X` / `[Amplitude] Page Y` event property names.
 *
 * Returns an empty object when the click has no pointer position:
 * - keyboard activations (Enter/Space on a button) and programmatic
 *   `element.click()` calls dispatch a click with `detail === 0`
 * - plain `Event`s (e.g. `dispatchEvent(new Event('click'))`) have no coordinates
 */
export const getClickPageCoordinates = (event: Event | MouseEvent | null | undefined): Record<string, number> => {
  if (!isPointerClick(event)) {
    return {};
  }
  const { pageX, pageY } = event;
  if (!isFiniteNumber(pageX) || !isFiniteNumber(pageY)) {
    return {};
  }
  return {
    [AMPLITUDE_EVENT_PROP_PAGE_X]: Math.round(pageX),
    [AMPLITUDE_EVENT_PROP_PAGE_Y]: Math.round(pageY),
  };
};

/** Grid parameters for the click cell, with defaults applied. */
export type ClickCellConfig = {
  /** Minimum width and height of a grid cell, in CSS pixels. */
  minCellSizePx: number;
  /** Largest number of cells along one axis. */
  maxCellsPerAxis: number;
};

/**
 * Resolves the `clickCell` option into the grid parameters to use, or `null`
 * when the click cell is disabled. Unusable values fall back to the defaults.
 */
export const resolveClickCellConfig = (options: ElementInteractionsOptions['clickCell']): ClickCellConfig | null => {
  if (options?.enabled === false) {
    return null;
  }
  const minCellSizePx = options?.minCellSizePx;
  const maxCellsPerAxis = options?.maxCellsPerAxis;
  return {
    minCellSizePx: isFiniteNumber(minCellSizePx) && minCellSizePx > 0 ? minCellSizePx : DEFAULT_CLICK_CELL_MIN_SIZE_PX,
    maxCellsPerAxis:
      isFiniteNumber(maxCellsPerAxis) && maxCellsPerAxis >= 1
        ? Math.floor(maxCellsPerAxis)
        : DEFAULT_CLICK_CELL_MAX_PER_AXIS,
  };
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Returns where inside `element` a pointer click landed, keyed by the click
 * cell event property names.
 *
 * A grid is laid over the element's bounding box, sized per axis as
 * `clamp(floor(size / minCellSizePx), 1, maxCellsPerAxis)`, and the cell under
 * the pointer is reported as `<cols>x<rows>:<col>,<row>` (zero-based from the
 * top-left). The value carries its own grid so it stays readable when the grid
 * parameters change. A click outside the box (a descendant that overflows it)
 * is assigned to the nearest edge cell.
 *
 * Must be called while the element is still laid out as it was when the click
 * happened: it reads the element's current bounding box.
 *
 * Returns an empty object when the click cell is disabled (`config` is null),
 * the click has no pointer position (see `getClickPageCoordinates`), or the
 * element has no size. It never throws: it runs in the click capture path, where
 * an error would end click tracking for the page.
 */
export const getClickCellProperties = (
  event: Event | MouseEvent | null | undefined,
  element: Element | null | undefined,
  config: ClickCellConfig | null,
): Record<string, string | number> => {
  if (!config || !isPointerClick(event) || typeof element?.getBoundingClientRect !== 'function') {
    return {};
  }
  const { clientX, clientY } = event;
  if (!isFiniteNumber(clientX) || !isFiniteNumber(clientY)) {
    return {};
  }
  try {
    const rect = element.getBoundingClientRect();
    if (!isFiniteNumber(rect.width) || !isFiniteNumber(rect.height) || rect.width <= 0 || rect.height <= 0) {
      return {};
    }
    const { minCellSizePx, maxCellsPerAxis } = config;
    const cols = clamp(Math.floor(rect.width / minCellSizePx), 1, maxCellsPerAxis);
    const rows = clamp(Math.floor(rect.height / minCellSizePx), 1, maxCellsPerAxis);
    const col = clamp(Math.floor(((clientX - rect.left) / rect.width) * cols), 0, cols - 1);
    const row = clamp(Math.floor(((clientY - rect.top) / rect.height) * rows), 0, rows - 1);
    return {
      [AMPLITUDE_EVENT_PROP_ELEMENT_CLICK_CELL]: `${cols}x${rows}:${col},${row}`,
      [AMPLITUDE_EVENT_PROP_ELEMENT_CLICK_CELL_MIN_SIZE]: minCellSizePx,
      [AMPLITUDE_EVENT_PROP_ELEMENT_CLICK_CELL_MAX_PER_AXIS]: maxCellsPerAxis,
      [AMPLITUDE_EVENT_PROP_ELEMENT_WIDTH]: Math.round(rect.width),
      [AMPLITUDE_EVENT_PROP_ELEMENT_HEIGHT]: Math.round(rect.height),
    };
  } catch {
    return {};
  }
};

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
  /**
   * Click cell properties of `closestTrackedAncestor`, read when the click was
   * captured. Kept apart from `targetElementProperties` because action clicks
   * are tracked later, after the element may have moved or resized.
   */
  clickCellProperties?: Record<string, string | number>;
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

/** Strip search params but keep path and hash so query-only changes are not treated as a new page. */
export function normalizePageUrl(href: string): string {
  if (!href) {
    return '';
  }

  try {
    const parsed = new URL(href);
    parsed.search = '';
    return getDecodeURI(parsed.href);
  } catch {
    return getDecodeURI(href);
  }
}

/** Normalized page URL used for viewport content and SPA navigation comparisons. */
export function getNormalizedPageUrl(globalScope = getGlobalScope()): string {
  /* istanbul ignore next */
  return normalizePageUrl(globalScope?.location?.href ?? '');
}

/** Resolve the post-navigation URL from a history API call. */
export function resolveHistoryNavigationUrl(
  url: string | URL | null | undefined,
  globalScope = getGlobalScope(),
): string {
  if (url == null || url === '') {
    return getNormalizedPageUrl(globalScope);
  }

  /* istanbul ignore next */
  const baseHref = globalScope?.location?.href || 'http://localhost/';

  try {
    return normalizePageUrl(new URL(url, baseHref).href);
  } catch {
    return getNormalizedPageUrl(globalScope);
  }
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
