import { Logger } from './logger';

export type ActionType = 'click' | 'change';

export interface AutocaptureOptions {
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
  shouldTrackEventResolver?: (actionType: ActionType, element: Element) => boolean;

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
}

export interface Messenger {
  logger?: Logger;
  setup: () => void;
}

interface Element {
  id: string;
  className: string;
}
