import { getGlobalScope, ILogger } from '@amplitude/analytics-core';
import { AMPLITUDE_ORIGIN, AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL } from '../constants';
import { asyncLoadScript } from '../helpers';

export type Action =
  | 'initialize-background-capture'
  | 'close-background-capture'
  | 'background-capture-loaded'
  | 'background-capture-complete'
  | 'page-loaded';

export type ActionData = {
  'initialize-background-capture': null | undefined;
  'close-background-capture': null | undefined;
  'background-capture-loaded': null | undefined;
  'background-capture-complete': { [key: string]: string | number | null };
  'page-loaded': null | undefined;
};

export interface Message<A extends Action> {
  source: 'amplitude-session-replay';
  action: A;
  data?: ActionData[A];
  requestId?: string;
}

export interface Messenger {
  logger?: ILogger;
  setup: (config: { endpoint?: string; logger?: ILogger }) => void;
  notify: <A extends Action>(message: Omit<Message<A>, 'source'>) => void;
  request: <A extends Action>(message: Omit<Message<A>, 'source'>, timeout?: number) => Promise<any>;
}

type RequestCallback = {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class WindowMessenger implements Messenger {
  logger?: ILogger;
  private endpoint?: string;
  private requestCallbacks: Map<string, RequestCallback> = new Map();
  private nextRequestId = 0;
  private amplitudeBackgroundCaptureInstance: any = null;

  setup(config: { endpoint?: string; logger?: ILogger } = {}) {
    const { endpoint = AMPLITUDE_ORIGIN, logger } = config;

    if (this.endpoint) {
      this.logger?.warn('Messenger already setup, skipping duplicate setup');
      return;
    }

    this.endpoint = endpoint;
    this.logger = logger;

    const globalScope = getGlobalScope();
    if (!globalScope) {
      this.logger?.warn('Cannot setup messenger: global scope not available');
      return;
    }

    // Listen for messages from parent window
    globalScope.addEventListener('message', (event) => {
      // Validate origin
      if (this.endpoint && event.origin !== this.endpoint) {
        return;
      }

      const message = event.data as Message<Action>;
      const { action, requestId, data } = message;

      // Ignore messages without action
      if (!action) {
        return;
      }

      // Handle responses to requests
      if (requestId && this.requestCallbacks.has(requestId)) {
        const callback = this.requestCallbacks.get(requestId);
        if (callback) {
          clearTimeout(callback.timeout);
          this.requestCallbacks.delete(requestId);
          callback.resolve(data);
        }
        return;
      }

      // Handle action messages
      if (action === 'initialize-background-capture') {
        this.initializeBackgroundCapture();
      } else if (action === 'close-background-capture') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        this.amplitudeBackgroundCaptureInstance?.close?.();
      }
    });

    // Notify the parent window that the page has loaded
    this.notify({ action: 'page-loaded' });
  }

  private initializeBackgroundCapture(): void {
    const scriptUrl = new URL(AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL, this.endpoint).toString();

    asyncLoadScript(scriptUrl)
      .then(() => {
        const globalScope = getGlobalScope();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const amplitudeBackgroundCaptureFn = (globalScope as any)?.amplitudeBackgroundCapture;

        if (amplitudeBackgroundCaptureFn) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          this.amplitudeBackgroundCaptureInstance = amplitudeBackgroundCaptureFn({
            messenger: this,
            onBackgroundCapture: this.onBackgroundCapture,
          });
        } else {
          this.logger?.warn('amplitudeBackgroundCapture function not found on global scope');
        }

        this.notify({ action: 'background-capture-loaded' });
      })
      .catch((error) => {
        this.logger?.warn('Failed to initialize background capture:', error);
      });
  }

  notify<A extends Action>(message: Omit<Message<A>, 'source'>): void {
    if (!this.endpoint) {
      this.logger?.warn('Cannot notify: messenger not setup');
      return;
    }

    const fullMessage: Message<A> = {
      source: 'amplitude-session-replay',
      ...message,
    };

    const globalScope = getGlobalScope();
    if (globalScope?.opener) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      globalScope.opener.postMessage(fullMessage, this.endpoint);
    } else {
      this.logger?.warn('Cannot notify: no window.opener');
    }
  }

  request<A extends Action>(message: Omit<Message<A>, 'source'>, timeout = 15000): Promise<any> {
    if (!this.endpoint) {
      return Promise.reject(new Error('Messenger not setup'));
    }

    const globalScope = getGlobalScope();
    if (!globalScope?.opener) {
      return Promise.reject(new Error('No window.opener'));
    }

    return new Promise((resolve, reject) => {
      const requestId = `req_${this.nextRequestId++}`;

      const timeoutHandle = setTimeout(() => {
        this.requestCallbacks.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
      }, timeout);

      this.requestCallbacks.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      const fullMessage: Message<A> = {
        source: 'amplitude-session-replay',
        requestId,
        ...message,
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      globalScope.opener.postMessage(fullMessage, this.endpoint);
    });
  }

  private onBackgroundCapture = (type: string, backgroundCaptureData: { [key: string]: string | number | null }) => {
    if (type === 'background-capture-complete') {
      this.notify({ action: 'background-capture-complete', data: backgroundCaptureData });
    }
  };
}
