/* istanbul ignore file */
/* eslint-disable no-restricted-globals */
import {
  AMPLITUDE_ORIGIN,
  AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL,
  AMPLITUDE_VISUAL_TAGGING_HIGHLIGHT_CLASS,
} from '../constants';
import { asyncLoadScript, getEventTagProps } from '../helpers';
import { Logger } from '@amplitude/analytics-types';
import { ActionType } from '../typings/default-event-tracking-advanced';

export interface Messenger {
  logger?: Logger;
  setup: () => void;
}

export type Action =
  | 'ping'
  | 'pong'
  | 'page-loaded'
  | 'selector-loaded'
  | 'initialize-visual-tagging-selector'
  | 'close-visual-tagging-selector'
  | 'element-selected'
  | 'track-selector-mode-changed'
  | 'track-selector-moved';

interface InitializeVisualTaggingSelectorData {
  actionType: ActionType;
}

interface ElementSelectedData {
  '[Amplitude] Element Tag'?: string;
  '[Amplitude] Element Text'?: string;
  '[Amplitude] Element Selector'?: string;
  '[Amplitude] Page URL'?: string;
  elementScreenshot?: Blob;
}

interface TrackSelectorModeChangedData {
  newMode: string;
  pageUrl?: string;
}

interface TrackSelectorMovedData {
  newEditorLocation: string;
  pageUrl?: string;
}

export type ActionData = {
  ping: null | undefined;
  pong: null | undefined;
  'page-loaded': null | undefined;
  'selector-loaded': null | undefined;
  'initialize-visual-tagging-selector': InitializeVisualTaggingSelectorData | null | undefined;
  'close-visual-tagging-selector': null | undefined;
  'element-selected': ElementSelectedData;
  'track-selector-mode-changed': TrackSelectorModeChangedData;
  'track-selector-moved': TrackSelectorMovedData;
};

export interface Message<A extends Action> {
  action: A;
  data?: ActionData[A];
}

export class WindowMessenger implements Messenger {
  endpoint = AMPLITUDE_ORIGIN;
  logger?: Logger;

  constructor({ origin = AMPLITUDE_ORIGIN }: { origin?: string } = {}) {
    this.endpoint = origin;
  }

  private notify(message: Message<Action>) {
    this.logger?.debug?.('Message sent: ', JSON.stringify(message));
    (window.opener as WindowProxy)?.postMessage?.(message, this.endpoint);
  }

  setup({
    logger,
    endpoint,
    isElementSelectable,
  }: {
    logger?: Logger;
    endpoint?: string;
    isElementSelectable?: (action: InitializeVisualTaggingSelectorData['actionType'], element: Element) => boolean;
  } = {}) {
    this.logger = logger;
    // If endpoint is customized, don't override it.
    if (endpoint && this.endpoint === AMPLITUDE_ORIGIN) {
      this.endpoint = endpoint;
    }
    let amplitudeVisualTaggingSelectorInstance: any = null;
    window.addEventListener('message', (event) => {
      this.logger?.debug?.('Message received: ', JSON.stringify(event));
      if (this.endpoint !== event.origin) {
        return;
      }
      const eventData = event?.data as Message<Action>;
      const action = eventData?.action;
      if (!action) {
        return;
      }
      if (action === 'ping') {
        this.notify({ action: 'pong' });
      } else if (action === 'initialize-visual-tagging-selector') {
        const actionData = eventData?.data as InitializeVisualTaggingSelectorData;
        asyncLoadScript(AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL)
          .then(() => {
            // eslint-disable-next-line
            amplitudeVisualTaggingSelectorInstance = (window as any)?.amplitudeVisualTaggingSelector?.({
              getEventTagProps,
              isElementSelectable: (element: Element) => {
                if (isElementSelectable) {
                  return isElementSelectable(actionData?.actionType || 'click', element);
                }
                return true;
              },
              onSelect: this.onSelect,
              onTrack: this.onTrack,
              visualHighlightClass: AMPLITUDE_VISUAL_TAGGING_HIGHLIGHT_CLASS,
            });
            this.notify({ action: 'selector-loaded' });
          })
          .catch(() => {
            this.logger?.warn('Failed to initialize visual tagging selector');
          });
      } else if (action === 'close-visual-tagging-selector') {
        // eslint-disable-next-line
        amplitudeVisualTaggingSelectorInstance?.close?.();
      }
    });
    this.notify({ action: 'page-loaded' });
  }

  private onSelect = (data: ElementSelectedData) => {
    this.notify({ action: 'element-selected', data });
  };

  private onTrack = (type: string, properties: { [key: string]: string | null }) => {
    if (type === 'selector-mode-changed') {
      this.notify({ action: 'track-selector-mode-changed', data: properties });
    } else if (type === 'selector-moved') {
      this.notify({ action: 'track-selector-moved', data: properties });
    }
  };
}
