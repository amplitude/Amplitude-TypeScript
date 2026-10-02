/* eslint-disable no-restricted-globals */
import {
  ElementInteractionsOptions,
  ActionType,
  getDecodeURI,
  IDiagnosticsClient,
  MASKED_TEXT_VALUE,
  TEXT_MASK_ATTRIBUTE,
  getPageTitle,
  replaceSensitiveString,
  type BrowserConfig,
} from '@amplitude/analytics-core';
import type { DataSource } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import * as constants from './constants';
import {
  removeEmptyProperties,
  extractPrefixedAttributes,
  isElementPointerCursor,
  getClosestElement,
  isElementBasedEvent,
  parseAttributesToMask,
  getCurrentPageViewId,
  resolveEventTarget,
} from './helpers';
import type { BaseTimestampedEvent, ElementBasedTimestampedEvent, TimestampedEvent, JSONValue } from './helpers';
import { getAncestors, getElementProperties } from './hierarchy';
import { getDataSource } from './pageActions/actions';
import { Hierarchy } from './typings/autocapture';
import {
  resolveSelectorConfig,
  type ElementSelectorRemoteConfig,
  type ElementSelectorLogger,
} from '@amplitude/element-selector';
import { shadowModeFromConfig, type ShadowGate, type ShadowMode } from './shadow-mode';
import { createSelectorRuntime, getSelectorRuntime, type SelectorRuntime } from './selector-runtime';

const hasMaskedAncestorLight = (element: Element): boolean => element.closest(`[${TEXT_MASK_ATTRIBUTE}]`) !== null;

const hasMaskedAncestorInShadow = (element: Element, shadow: ShadowMode): boolean => {
  if (getAncestors(element, shadow).some((ancestor) => ancestor.hasAttribute(TEXT_MASK_ATTRIBUTE))) {
    return true;
  }
  // `getAncestors` stops before `<html>`; preserve the document-element check.
  return document.documentElement?.hasAttribute(TEXT_MASK_ATTRIBUTE) ?? false;
};

export class DataExtractor {
  private readonly additionalMaskTextPatterns: RegExp[];
  diagnosticsClient?: IDiagnosticsClient;

  /**
   * Selector state starts private so standalone DataExtractor consumers do not
   * affect one another. Plugin setup replaces it with the runtime associated
   * with that BrowserConfig, sharing state between the autocapture and
   * frustration plugins of one SDK instance without leaking it to another.
   *
   * The engine ships dormant: with `enabled: false` it routes through the
   * byte-identical legacy walker until remote config enables it.
   */
  private selectorRuntime: SelectorRuntime;

  /**
   * Exposed because observables read the gate per callback and subscribe to its
   * arming to run their shadow discovery scan.
   */
  get shadowGate(): ShadowGate {
    return this.selectorRuntime.shadowGate;
  }

  constructor(options: ElementInteractionsOptions, context?: { diagnosticsClient: IDiagnosticsClient }) {
    this.diagnosticsClient = context?.diagnosticsClient;
    this.selectorRuntime = createSelectorRuntime();

    const rawPatterns = options.maskTextRegex ?? [];

    const compiled: RegExp[] = [];
    for (const entry of rawPatterns) {
      if (compiled.length >= constants.MAX_MASK_TEXT_PATTERNS) {
        break;
      }
      if (entry instanceof RegExp) {
        compiled.push(entry);
      } else if ('pattern' in entry && typeof entry.pattern === 'string') {
        try {
          compiled.push(new RegExp(entry.pattern, 'i'));
        } catch {
          // ignore invalid pattern strings
        }
      }
    }
    this.additionalMaskTextPatterns = compiled;
  }

  /**
   * Join the selector runtime owned by this browser SDK instance.
   *
   * Called at the beginning of plugin setup, before subscriptions or
   * observables retain a reference to the shadow gate.
   */
  bindSelectorRuntime = (config: BrowserConfig): void => {
    this.selectorRuntime = getSelectorRuntime(config);
  };

  /**
   * Wrapper method to replace sensitive strings using the helper function
   * @param text - The text to search for sensitive data
   * @returns The text with sensitive data replaced by masked text
   */
  replaceSensitiveString = (text: string | null): string => {
    return replaceSensitiveString(text, this.additionalMaskTextPatterns);
  };

  // Get the DOM hierarchy of the element, starting from the target element to the root element.
  getHierarchy = (element: Element | null): Hierarchy => {
    const startTime = performance.now();

    let hierarchy: Hierarchy = [];
    if (!element) {
      return [];
    }

    // Get list of ancestors including itself and get properties at each level in the hierarchy.
    // When the shadow mode is enabled the ancestor walk crosses shadow
    // boundaries into host elements, up to the mode's depth; otherwise it stays
    // within the element's own tree.
    const shadow = this.getShadowMode();
    const ancestors = getAncestors(element, shadow);

    // Build attributes to mask map
    const elementToAttributesToMaskMap = new Map<Element, Set<string>>();

    for (let i = ancestors.length - 1; i >= 0; i--) {
      const node = ancestors[i];
      if (node) {
        const attributesToMask = parseAttributesToMask(node.getAttribute(constants.DATA_AMP_MASK_ATTRIBUTES));
        const ancestorAttributesToMask =
          i === ancestors.length - 1 ? [] : elementToAttributesToMaskMap.get(ancestors[i + 1]) ?? new Set<string>();
        const combinedAttributesToMask = new Set([...ancestorAttributesToMask, ...attributesToMask]);
        elementToAttributesToMaskMap.set(node, combinedAttributesToMask);
      }
    }

    hierarchy = ancestors.map((el) =>
      getElementProperties(el, elementToAttributesToMaskMap.get(el) ?? new Set<string>(), shadow),
    );

    // Search for and mask any sensitive attribute values
    for (const hierarchyNode of hierarchy) {
      if (hierarchyNode?.attrs) {
        Object.entries(hierarchyNode.attrs).forEach(([key, value]) => {
          if (hierarchyNode.attrs) {
            hierarchyNode.attrs[key] = this.replaceSensitiveString(value);
          }
        });
      }
    }

    const endTime = performance.now();
    this.diagnosticsClient?.recordHistogram('autocapturePlugin.getHierarchy', endTime - startTime);

    return hierarchy;
  };

  getNearestLabel = (element: Element): string => {
    const parent = element.parentElement;
    if (!parent) {
      return '';
    }
    let labelElement: Element | null;
    try {
      labelElement = parent.querySelector(':scope>span,h1,h2,h3,h4,h5,h6');
    } catch {
      /* istanbul ignore next */
      labelElement = null;
    }
    if (labelElement) {
      /* istanbul ignore next */
      return this.getText(labelElement);
    }
    return this.getNearestLabel(parent);
  };

  getElementPath = (element: Element | null): string => {
    if (!element) {
      return '';
    }
    const startTime = performance.now();

    const elementPath = this.selectorRuntime.engine.generate(element);

    const endTime = performance.now();
    this.diagnosticsClient?.recordHistogram('autocapturePlugin.getElementPath', endTime - startTime);

    return elementPath;
  };

  /**
   * Apply an element-selector remote-config payload to the shared engine.
   * Ignores `null`/absent deliveries and partial payloads that omit both
   * `enabled` and `shadowDomEnabled` (incomplete cache/remote handoffs must
   * not reset a live engine). Shadow piercing is latched via {@link ShadowGate};
   * the engine's shadow fields always mirror the gate so selectors stay in
   * lockstep with capture.
   */
  updateSelectorConfig = (remote?: ElementSelectorRemoteConfig | null, logger?: ElementSelectorLogger): void => {
    if (remote === null || remote === undefined) {
      return;
    }

    const hasEnabled = typeof remote.enabled === 'boolean';
    const hasShadow = typeof remote.shadowDomEnabled === 'boolean';
    if (!hasEnabled && !hasShadow) {
      logger?.debug(
        '@amplitude/element-selector: ignoring remote-config delivery without an explicit `enabled` or `shadowDomEnabled` flag — keeping current engine state.',
      );
      return;
    }

    const resolved = resolveSelectorConfig(remote, logger);
    const prevEnabled = this.selectorRuntime.engine.getConfig().enabled;
    const prevShadow = this.shadowGate.get().enabled;
    const mode = this.shadowGate.arm(shadowModeFromConfig(resolved));

    this.selectorRuntime.engine.updateConfig({
      ...(hasEnabled ? resolved : this.selectorRuntime.engine.getConfig()),
      shadowDomEnabled: mode.enabled,
      ...(mode.enabled && { maxShadowDomDepth: mode.maxDepth }),
    });

    if (hasEnabled && prevEnabled !== resolved.enabled) {
      logger?.debug(
        resolved.enabled
          ? '@amplitude/element-selector: engine enabled — now emitting new element-selector element paths for autocapture events.'
          : '@amplitude/element-selector: engine disabled — reverting to legacy cssPath for element paths.',
      );
    }

    if (!prevShadow && mode.enabled) {
      this.diagnosticsClient?.setTag('plugin.autocapture.shadowDom', `enabled:${mode.maxDepth}`);
    }
  };

  /**
   * The shadow-DOM mode for this page. Callable from anywhere and as often as
   * needed: the gate holds one value once armed, so repeated reads within a
   * single event resolve identically.
   */
  getShadowMode = (): ShadowMode => {
    return this.shadowGate.get();
  };

  // Returns the Amplitude event properties for the given element.
  getEventProperties = (actionType: ActionType, element: Element, dataAttributePrefix: string) => {
    /* istanbul ignore next */
    const tag = element?.tagName?.toLowerCase?.();
    /* istanbul ignore next */
    const rect =
      typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : { left: null, top: null };

    const hierarchy = this.getHierarchy(element);
    const currentElementAttributes = hierarchy[0]?.attrs;
    const nearestLabel = this.getNearestLabel(element);
    const attributes = extractPrefixedAttributes(currentElementAttributes ?? {}, dataAttributePrefix);

    /* istanbul ignore next */
    const properties: Record<string, any> = {
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_HIERARCHY]: hierarchy,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: this.getText(element),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_LEFT]: rect.left == null ? null : Math.round(rect.left),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_TOP]: rect.top == null ? null : Math.round(rect.top),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ATTRIBUTES]: attributes,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_PATH]: this.getElementPath(element),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_PARENT_LABEL]: nearestLabel,
      [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: getDecodeURI(window.location.href.split('?')[0]),
      [constants.AMPLITUDE_EVENT_PROP_PAGE_TITLE]: (
        getPageTitle as (parseTitleFunction: (title: string) => string) => string
      )(this.replaceSensitiveString),
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_HEIGHT]: window.innerHeight,
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_WIDTH]: window.innerWidth,
    };

    const pageViewId = getCurrentPageViewId();
    /* istanbul ignore next */
    if (pageViewId) {
      /* istanbul ignore next */
      properties[constants.AMPLITUDE_EVENT_PROP_PAGE_VIEW_ID] = pageViewId;
    }

    // id is never masked, so always include it
    properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_ID] = element.getAttribute('id') || '';

    // class is never masked, so always include it
    properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_CLASS] = element.getAttribute('class');

    properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_ARIA_LABEL] = currentElementAttributes?.['aria-label'];

    if (tag === 'a' && actionType === 'click' && element instanceof HTMLAnchorElement) {
      const href = element.href.substring(0, constants.MAX_ATTRIBUTE_LENGTH);
      properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_HREF] = this.replaceSensitiveString(href); // we don't use hierarchy here because we don't want href value to be changed
    }

    return removeEmptyProperties(properties);
  };

  addTypeAndTimestamp = <T>(
    event: T,
    type: BaseTimestampedEvent<T>['type'] | ElementBasedTimestampedEvent<T>['type'],
  ): BaseTimestampedEvent<T> | ElementBasedTimestampedEvent<T> => {
    return {
      event,
      timestamp: Date.now(),
      type,
    };
  };

  addAdditionalEventProperties = <T>(
    event: T,
    type: TimestampedEvent<T>['type'],
    selectorAllowlist: string[],
    dataAttributePrefix: string,
    // capture the event if the cursor is a "pointer" when this element is clicked on
    // reason: a "pointer" cursor indicates that an element should be interactable
    //         regardless of the element's tag name
    isCapturingCursorPointer = false,
  ): TimestampedEvent<T> | ElementBasedTimestampedEvent<T> => {
    const baseEvent = this.addTypeAndTimestamp(event, type);

    // Enrichment error boundary. This runs on every captured event (in the
    // observable `.map`), and its DOM traversal — event-target resolution,
    // `getClosestElement`, `getEventProperties` (hierarchy + selector engine) —
    // is the main place autocapture touches arbitrary customer DOM. A throw here
    // must never crash the host page or tear down the capture stream, so we
    // contain it once here rather than guarding each helper. On failure the
    // event is emitted unenriched (and typically dropped downstream for lacking
    // a tracked ancestor) — acceptable degradation, not a page crash.
    try {
      if (isElementBasedEvent(baseEvent) && baseEvent.event.target !== null) {
        // Read once and pass into each call below, so the mode governing this
        // event is visible in one place.
        const shadow = this.getShadowMode();
        const eventTarget = resolveEventTarget(baseEvent.event, shadow);
        if (isCapturingCursorPointer) {
          const isCursorPointer = isElementPointerCursor(eventTarget as Element, baseEvent.type);
          if (isCursorPointer) {
            baseEvent.closestTrackedAncestor = eventTarget as HTMLElement;
            baseEvent.targetElementProperties = this.getEventProperties(
              baseEvent.type,
              baseEvent.closestTrackedAncestor,
              dataAttributePrefix,
            );
            return baseEvent;
          }
        }
        // Retrieve additional event properties from the target element
        const closestTrackedAncestor = getClosestElement(eventTarget as HTMLElement, selectorAllowlist, shadow);
        if (closestTrackedAncestor) {
          baseEvent.closestTrackedAncestor = closestTrackedAncestor;
          baseEvent.targetElementProperties = this.getEventProperties(
            baseEvent.type,
            closestTrackedAncestor,
            dataAttributePrefix,
          );
        }
      }
    } catch {
      // Best-effort enrichment: fall through and emit the base event.
    }

    return baseEvent;
  };

  extractDataFromDataSource = (dataSource: DataSource, contextElement: HTMLElement) => {
    // Extract from DOM Element
    if (dataSource.sourceType === 'DOM_ELEMENT') {
      const sourceElement = getDataSource(dataSource, contextElement);
      if (!sourceElement) {
        return undefined;
      }

      if (dataSource.elementExtractType === 'TEXT') {
        return this.getText(sourceElement);
      } else if (dataSource.elementExtractType === 'ATTRIBUTE' && dataSource.attribute) {
        return sourceElement.getAttribute(dataSource.attribute);
      }
      return undefined;
    }

    // TODO: Extract from other source types
    return undefined;
  };

  // Traverse text content without cloning DOM nodes, which avoids media/network side effects
  // from recreating nested elements such as <video>, <audio>, or <img>.
  private getTextWithMaskedDescendants = (element: Element): string => {
    const maskedSelector = `[${TEXT_MASK_ATTRIBUTE}], [contenteditable]`;
    // Fast path: if no masked descendants exist, rely on native text extraction.
    if (!element.querySelector(maskedSelector)) {
      return (element as HTMLElement).innerText;
    }

    let output = '';
    const childNodes = Array.from(element.childNodes);
    for (const childNode of childNodes) {
      if (childNode.nodeType === Node.TEXT_NODE) {
        output += childNode.textContent || '';
        continue;
      }

      if (!(childNode instanceof Element)) {
        continue;
      }

      // Replace entire masked/contenteditable subtrees with the mask token.
      if (childNode.hasAttribute(TEXT_MASK_ATTRIBUTE) || childNode.hasAttribute('contenteditable')) {
        output += MASKED_TEXT_VALUE;
        continue;
      }
      output += this.getTextWithMaskedDescendants(childNode);
    }
    return output;
  };

  /**
   * Whether `element` or any ancestor carries the text-mask attribute.
   *
   * `Element.closest` stops at the top of the element's own tree, so it cannot
   * see a mask attribute on a shadow host or on a light-DOM ancestor above one.
   * When the mode is enabled the check uses the composed ancestor walk instead.
   *
   * The disabled path stays on `closest()` rather than the walk because
   * `getAncestors` stops below `<html>`, so the walk would miss a mask attribute
   * set on the root element.
   */
  private hasMaskedAncestor = (element: Element): boolean => {
    const shadow = this.getShadowMode();
    return shadow.enabled ? hasMaskedAncestorInShadow(element, shadow) : hasMaskedAncestorLight(element);
  };

  getText = (element: Element): string => {
    // Check if element or any parent has data-amp-mask attribute
    const hasMaskAttribute = this.hasMaskedAncestor(element);
    if (hasMaskAttribute) {
      return MASKED_TEXT_VALUE;
    }
    let output = '';
    if (!element.querySelector(`[${TEXT_MASK_ATTRIBUTE}], [contenteditable]`)) {
      output = (element as HTMLElement).innerText || '';
    } else {
      output = this.getTextWithMaskedDescendants(element);
    }
    return this.replaceSensitiveString(output.substring(0, 255)).replace(/\s+/g, ' ').trim();
  };

  // Returns the element properties for the given element in Visual Labeling.
  getEventTagProps = (element: Element): Record<string, JSONValue> => {
    if (!element) {
      return {};
    }
    /* istanbul ignore next */
    const tag = element?.tagName?.toLowerCase?.();

    const properties = {
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: this.getText(element),
      [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: window.location.href.split('?')[0],
    };
    return removeEmptyProperties(properties) as Record<string, JSONValue>;
  };
}
