/* eslint-disable no-restricted-globals */
import { ILogger } from '../logger';
import { Messenger } from '../types/element-interactions';
import { getGlobalScope } from '../global-scope';
import { AMPLITUDE_ORIGIN } from './constants';
import { asyncLoadScript, generateUniqueId } from './utils';

type MessageRequest = {
  id: string;
  action: string;
  args: Record<string, any>;
};

type MessageResponse = {
  id: string;
  action: string;
  responseData: any;
};

export type ActionHandler = (data: any) => void;

/**
 * Brand key used to identify BaseWindowMessenger instances across bundle boundaries.
 */
const MESSENGER_BRAND = '__AMPLITUDE_MESSENGER_INSTANCE__' as const;

/** Global scope key where the singleton messenger is stored. */
const MESSENGER_GLOBAL_KEY = '__AMPLITUDE_MESSENGER__';

/**
 * BaseWindowMessenger provides generic cross-window communication via postMessage.
 * Singleton access via getOrCreateWindowMessenger() to prevent duplicate instances
 */
class BaseWindowMessenger implements Messenger {
  /** Brand property for cross-bundle instanceof checks. */
  readonly [MESSENGER_BRAND] = true;

  endpoint: string;
  logger?: ILogger;
  private isSetup = false;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  requestCallbacks: {
    [id: string]: {
      resolve: (data: any) => void;
      reject: (data: any) => void;
    };
  } = {};
  private actionHandlers = new Map<string, ActionHandler>();

  /**
   * Messages received for actions that had no registered handler yet.
   * Drained automatically when the corresponding handler is registered via
   * registerActionHandler(), solving startup race conditions between
   * independently-initialized plugins (e.g. autocapture + session-replay).
   */
  private pendingMessages = new Map<string, any[]>();

  /**
   * Tracks in-flight and completed script loads by URL.
   * Using a map, this prevents duplicate loads before the first resolves.
   */
  private scriptLoadPromises = new Map<string, Promise<void>>();

  constructor({ origin = AMPLITUDE_ORIGIN }: { origin?: string } = {}) {
    this.endpoint = origin;
  }

  /**
   * Send a message to the parent window (window.opener).
   */
  notify(message: { action: string; data?: any } | MessageRequest) {
    this.logger?.debug?.('Message sent: ', JSON.stringify(message));
    (window.opener as WindowProxy)?.postMessage?.(message, this.endpoint);
  }

  /**
   * Send an async request to the parent window with a unique ID.
   * Returns a Promise that resolves when the parent responds.
   */
  public sendRequest(action: string, args: Record<string, any>, options = { timeout: 15_000 }): Promise<any> {
    const id = generateUniqueId();
    const request: MessageRequest = { id, action, args };

    const promise = new Promise((resolve, reject) => {
      this.requestCallbacks[id] = { resolve, reject };

      this.notify(request);

      if (options.timeout > 0) {
        setTimeout(() => {
          reject(new Error(`${action} timed out (id: ${id})`));
          delete this.requestCallbacks[id];
        }, options.timeout);
      }
    });

    return promise;
  }

  /**
   * Handle a response to a previous request by resolving its Promise.
   */
  private handleResponse(response: MessageResponse) {
    if (!this.requestCallbacks[response.id]) {
      this.logger?.warn(`No callback found for request id: ${response.id}`);
      return;
    }

    this.requestCallbacks[response.id].resolve(response.responseData);
    delete this.requestCallbacks[response.id];
  }

  /**
   * Register a handler for a specific action type.
   * Logs a warning if overwriting an existing handler.
   */
  registerActionHandler(action: string, handler: ActionHandler) {
    if (this.actionHandlers.has(action)) {
      this.logger?.warn?.(`Overwriting existing action handler for: ${action}`);
    }
    this.actionHandlers.set(action, handler);

    // Replay any messages that arrived before this handler was registered
    const queued = this.pendingMessages.get(action);
    if (queued) {
      this.pendingMessages.delete(action);
      for (const data of queued) {
        handler(data);
      }
    }
  }

  /**
   * Load a script once, deduplicating by URL.
   * Safe against concurrent calls — the second call awaits the first's in-flight Promise
   * rather than triggering a duplicate load.
   */
  async loadScriptOnce(url: string): Promise<void> {
    const existing = this.scriptLoadPromises.get(url);
    if (existing) {
      return existing;
    }

    const loadPromise = asyncLoadScript(url).then(() => {
      // Resolve to void
    });
    this.scriptLoadPromises.set(url, loadPromise);

    try {
      await loadPromise;
    } catch (error) {
      // Remove failed loads so they can be retried
      this.scriptLoadPromises.delete(url);
      throw error;
    }
  }

  /**
   * Set up the message listener. Idempotent — safe to call multiple times.
   * Subclasses should call super.setup() and then register their own action handlers.
   */
  setup({ logger, endpoint }: { logger?: ILogger; endpoint?: string } = {}) {
    if (logger) {
      this.logger = logger;
    }

    // If endpoint is customized, don't override a previously customized endpoint.
    if (endpoint && this.endpoint === AMPLITUDE_ORIGIN) {
      this.endpoint = endpoint;
    }

    // Only attach the message listener once
    if (this.isSetup) {
      return;
    }
    this.isSetup = true;

    this.logger?.debug?.('Setting up messenger');

    // Attach Event Listener to listen for messages from the parent window
    this.messageHandler = (event: MessageEvent) => {
      this.logger?.debug?.('Message received: ', JSON.stringify(event));

      // Only accept messages from the specified origin
      if (this.endpoint !== event.origin) {
        return;
      }

      const eventData = event.data as { action?: string; id?: string; data?: any; responseData?: any };
      const action = eventData?.action;

      // Ignore messages without action
      if (!action) {
        return;
      }

      // If id exists, handle responses to previous requests
      if ('id' in eventData && eventData.id) {
        this.logger?.debug?.('Received Response to previous request: ', JSON.stringify(event));
        this.handleResponse(eventData as MessageResponse);
      } else {
        if (action === 'ping') {
          this.notify({ action: 'pong' });
        }

        // Dispatch to registered action handlers, or buffer for late registration
        const handler = this.actionHandlers.get(action);
        if (handler) {
          handler(eventData.data);
        } else {
          const queue = this.pendingMessages.get(action) ?? [];
          queue.push(eventData.data);
          this.pendingMessages.set(action, queue);
        }
      }
    };
    window.addEventListener('message', this.messageHandler);

    this.notify({ action: 'page-loaded' });
  }

  /**
   * Tear down the messenger: remove the message listener, clear all state.
   */
  destroy() {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.isSetup = false;
    this.actionHandlers.clear();
    this.pendingMessages.clear();
    this.requestCallbacks = {};
    this.scriptLoadPromises.clear();

    // Remove from global scope if this is the singleton
    const globalScope = getGlobalScope() as Record<string, unknown> | undefined;
    if (globalScope?.[MESSENGER_GLOBAL_KEY] === this) {
      delete globalScope[MESSENGER_GLOBAL_KEY];
    }
  }
}

/**
 * Type guard: checks whether a value is a BaseWindowMessenger instance.
 */
function isWindowMessenger(value: unknown): value is BaseWindowMessenger {
  return (
    typeof value === 'object' &&
    value !== null &&
    MESSENGER_BRAND in value &&
    (value as Record<string, unknown>)[MESSENGER_BRAND] === true
  );
}

/**
 * Get or create a singleton BaseWindowMessenger instance.
 * Ensures only one messenger (and one message listener) exists per page,
 * preventing duplicate script loads and double notifications.
 *
 * The singleton is stored on globalScope under the same MESSENGER_KEY.
 * The branded property check verifies the stored value is actually a messenger.
 */
export function getOrCreateWindowMessenger(options?: { origin?: string }): BaseWindowMessenger {
  const globalScope = getGlobalScope() as Record<string, unknown> | undefined;

  const existing = globalScope?.[MESSENGER_GLOBAL_KEY];
  if (isWindowMessenger(existing)) {
    return existing;
  }

  const messenger = new BaseWindowMessenger(options);
  if (globalScope) {
    globalScope[MESSENGER_GLOBAL_KEY] = messenger;
  }
  return messenger;
}

export type { BaseWindowMessenger };
