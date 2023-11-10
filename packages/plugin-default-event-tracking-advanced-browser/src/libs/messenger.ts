/* istanbul ignore file */
/* eslint-disable no-restricted-globals */
import { AMPLITUDE_ORIGIN, AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL } from '../constants';
import { asyncLoadScript } from '../helpers';
import { Logger } from '@amplitude/analytics-types';

export interface IMessenger {
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

export class WindowMessenger implements IMessenger {
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
    this.notify({ action: 'page-loaded' });
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
      if (action === 'ping') {
        this.notify({ action: 'pong' });
      } else if (action === 'initialize-visual-tagging-selector') {
        asyncLoadScript(AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL)
          .then(() => {
            // eslint-disable-next-line
            amplitudeVisualTaggingSelectorInstance = (window as any)?.amplitudeVisualTaggingSelector?.({
              onSelect: this.onSelect,
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
  }

  private onSelect = (data: Data) => {
    this.notify({ action: 'element-selected', data });
  };
}
