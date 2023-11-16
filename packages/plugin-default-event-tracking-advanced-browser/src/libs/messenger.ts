/* istanbul ignore file */
/* eslint-disable no-restricted-globals */
import { AMPLITUDE_ORIGIN, AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL } from '../constants';
import { asyncLoadScript } from '../helpers';
import { Logger } from '@amplitude/analytics-types';

export interface Messenger {
  logger?: Logger;
  setup: () => void;
}

interface Data {
  [key: string]: any;
}

interface Message {
  action: string;
  data?: Data;
}

export const Action = {
  Ping: 'ping',
  Pong: 'pong',
  PageLoaded: 'page-loaded',
  SelectorLoaded: 'selector-loaded',
  InitializeVisualTaggingSelector: 'initialize-visual-tagging-selector',
  CloseVisualTaggingSelector: 'close-visual-tagging-selector',
  ElementSelected: 'element-selected',
};

export class WindowMessenger implements Messenger {
  endpoint = AMPLITUDE_ORIGIN;
  logger?: Logger;

  constructor({ logger }: { logger?: Logger } = {}) {
    this.logger = logger;
  }

  private notify(message: Message) {
    this.logger?.debug('Message sent: ', message);
    (window.opener as WindowProxy)?.postMessage?.(message, this.endpoint);
  }

  setup() {
    let amplitudeVisualTaggingSelectorInstance: any = null;
    window.addEventListener('message', (event) => {
      this.logger?.debug('Message received: ', event);
      if (this.endpoint !== event.origin) {
        return;
      }
      const eventData = event?.data as Message;
      const action = eventData?.action;
      if (!action) {
        return;
      }
      if (action === Action.Ping) {
        this.notify({ action: Action.Pong });
      } else if (action === Action.InitializeVisualTaggingSelector) {
        asyncLoadScript(AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL)
          .then(() => {
            // eslint-disable-next-line
            amplitudeVisualTaggingSelectorInstance = (window as any)?.amplitudeVisualTaggingSelector?.({
              onSelect: this.onSelect,
            });
            this.notify({ action: Action.SelectorLoaded });
          })
          .catch(() => {
            this.logger?.warn('Failed to initialize visual tagging selector');
          });
      } else if (action === Action.CloseVisualTaggingSelector) {
        // eslint-disable-next-line
        amplitudeVisualTaggingSelectorInstance?.close?.();
      }
    });
    this.notify({ action: Action.PageLoaded });
  }

  private onSelect = (data: Data) => {
    this.notify({ action: Action.ElementSelected, data });
  };
}
