import { ILogger } from '../logger';

export type ActionType = 'click' | 'change';

/**
 * Default CSS selectors to define which elements on the page to track.
 * Extend this list to include additional elements to track. For example:
 * ```
 * autocapturePlugin({
 *    cssSelectorAllowlist: [...DEFAULT_CSS_SELECTOR_ALLOWLIST, ".my-class"],
 * })
 * ```
 */
export const DEFAULT_CSS_SELECTOR_ALLOWLIST = [
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
];

/**
 * Default prefix to allow the plugin to capture data attributes as an event property.
 */
export const DEFAULT_DATA_ATTRIBUTE_PREFIX = 'data-amp-track-';

/**
 * Default list of elements on the page should be tracked when the page changes.
 */
export const DEFAULT_ACTION_CLICK_ALLOWLIST = ['div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export interface ElementInteractionsOptions {
  /**
   * List of CSS selectors to allow auto tracking on.
   * When provided, allow elements matching any selector to be tracked.
   * Default is ['a', 'button', 'input', 'select', 'textarea', 'label', '[data-amp-default-track]', '.amp-default-track'].
   */
  cssSelectorAllowlist?: string[];

  /**
   * List of page URLs to allow auto tracking on.
   * When provided, only allow tracking on these URLs.
   * Both full URLs and regex are supported.
   */
  pageUrlAllowlist?: (string | RegExp)[];

  /**
   * Function to determine whether an event should be tracked.
   * When provided, this function overwrites all other allowlists and configurations.
   * If the function returns true, the event will be tracked.
   * If the function returns false, the event will not be tracked.
   * @param actionType - The type of action that triggered the event.
   * @param element - The [Element](https://developer.mozilla.org/en-US/docs/Web/API/Element) that triggered the event.
   */
  shouldTrackEventResolver?: (actionType: ActionType, element: DomElement) => boolean;

  /**
   * Prefix for data attributes to allow auto collecting.
   * Default is 'data-amp-track-'.
   */
  dataAttributePrefix?: string;

  /**
   * Options for integrating visual tagging selector.
   */
  visualTaggingOptions?: {
    enabled?: boolean;
    messenger?: Messenger;
  };

  /**
   * Debounce time in milliseconds for tracking events.
   * This is used to detect rage clicks.
   */
  debounceTime?: number;

  /**
   * CSS selector allowlist for tracking clicks that result in a DOM change/navigation on elements not already allowed by the cssSelectorAllowlist
   */
  actionClickAllowlist?: string[];

  /**
   * Remote config for page actions
   */
  pageActions?: {
    triggers: Trigger[];
    labeledEvents: Record<string, LabeledEvent>;
  };
}

type MatchingCondition = {
  type: 'LABELED_EVENT';
  match: {
    eventId: string;
  };
};

export type Trigger = {
  id: string;
  name: string; // Human friendly name for the trigger
  conditions: MatchingCondition[]; // Configures when the actions should be executed; AND
  actions: Array<PageAction | string>; // Actions to execute if conditions are met
};

export type PageAction = {
  id: string;
  actionType: 'ATTACH_EVENT_PROPERTY';
  dataSource: DataSource; // Defines where and how to get the data
  destinationKey: string; // Property key name for the data (e.g. event property name, data layer key, user property name)
};

export type DataSource = {
  sourceType: 'DOM_ELEMENT' | 'PAGE_CONTEXT'; // | 'URL' ;
} & (
  | {
      sourceType: 'DOM_ELEMENT';
      selector?: string; // For DOM_ELEMENT: CSS selector for the target element
      elementExtractType: 'TEXT' | 'ATTRIBUTE';
      attribute?: string; // For DOM_ELEMENT: Attribute name to extract (null/empty for text content)
      scope?: string; // CSS selector for the scope of the element, document by default
    }
  | {
      sourceType: 'PAGE_CONTEXT';
      propertyPath: string; // For PAGE_CONTEXT: e.g., 'document.title'
    }
);

export type EventSubpropKey = '[Amplitude] Element Text' | '[Amplitude] Element Hierarchy';

export type Filter = {
  subprop_key: EventSubpropKey;
  subprop_op: string; // exact, autotrack css match
  subprop_value: string[];
};

export type LabeledEvent = {
  id: string;
  definition: {
    event_type: 'click' | 'change'; // [Amplitude] Element Clicked | [Amplitude] Element Changed
    filters: Filter[];
  }[];
};

export interface Messenger {
  logger?: ILogger;
  setup: () => void;
}

// DomElement is [Element](https://developer.mozilla.org/en-US/docs/Web/API/Element) if the dom library is included in tsconfig.json
// and never if it is not included
// eslint-disable-next-line no-restricted-globals
type DomElement = typeof globalThis extends {
  Element: new (...args: any) => infer T;
}
  ? T
  : never;
