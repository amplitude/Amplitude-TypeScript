import { getPageUrl } from '../helpers';
import { UGCFilterRule } from '../config/types';
import { DEFAULT_URL_CHANGE_POLLING_INTERVAL } from '../constants';
import { RecordPlugin } from '@amplitude/rrweb-types';

/**
 * Event emitted when URL changes are detected by the plugin
 * Contains the current page URL, title, and viewport dimensions
 */
export interface URLChangeEvent {
  /** The current page URL (may be filtered if UGC rules are applied) */
  href: string;
  /** The current page title */
  title: string;
  /** Viewport height in pixels */
  viewportHeight: number;
  /** Viewport width in pixels */
  viewportWidth: number;
  /** The type of URL change event */
  type: string;
}

/**
 * Configuration options for the URL tracking plugin
 */
export interface URLTrackingPluginOptions {
  /** Rules for filtering sensitive URLs (User Generated Content) */
  ugcFilterRules?: UGCFilterRule[];
  /** Whether to use polling instead of history API events for URL detection */
  enablePolling?: boolean;
  /** Interval in milliseconds for polling URL changes (default: 1000ms) */
  pollingInterval?: number;
  /** Whether to capture document title in URL change events (default: false) */
  captureDocumentTitle?: boolean;
}

/** Options for subscribeToUrlChanges (polling vs history + hash) */
export interface SubscribeToUrlChangesOptions {
  /** Use polling instead of history/popstate/hashchange (e.g. when history is unreliable) */
  enablePolling?: boolean;
  /** Polling interval in ms when enablePolling is true (default: 1000) */
  pollingInterval?: number;
}

/** Per-globalScope subscription state so we only patch history once when multiple subscribers exist */
const urlChangeSubscriptionsByScope = new WeakMap<
  Window,
  { callbacks: Set<(href: string) => void>; cleanup: () => void }
>();

/**
 * Single helper for URL change detection. Supports:
 * - History API (pushState/replaceState) + popstate + hashchange (shared patch per scope)
 * - Optional polling (setInterval on location.href)
 *
 * Used by session-replay targeting (re-evaluate on URL change) and the URL tracking plugin
 * (emit rrweb events). Call the returned function to unsubscribe.
 *
 * @param globalScope - window (or equivalent); no-op if undefined
 * @param onUrlChange - called when the URL changes, with the new href
 * @param options - optional polling (default: event-based only)
 * @returns cleanup function to remove this subscription
 */
export function subscribeToUrlChanges(
  globalScope: Window | undefined,
  onUrlChange: (href: string) => void,
  options: SubscribeToUrlChangesOptions = {},
): () => void {
  if (!globalScope?.location) {
    return (): void => {
      return;
    };
  }

  const { enablePolling = false, pollingInterval = DEFAULT_URL_CHANGE_POLLING_INTERVAL } = options;

  if (enablePolling) {
    const getHref = (): string => globalScope.location.href ?? '';
    const id = globalScope.setInterval(() => onUrlChange(getHref()), pollingInterval);
    return (): void => {
      if (id != null) {
        globalScope.clearInterval(id);
      }
    };
  }

  let state = urlChangeSubscriptionsByScope.get(globalScope);
  if (!state) {
    let lastHref: string | undefined = undefined;
    const callbacks = new Set<(href: string) => void>();

    const getHref = (): string => globalScope.location.href ?? '';

    const notify = () => {
      const href = getHref();
      if (lastHref !== undefined && href === lastHref) return;
      lastHref = href;
      callbacks.forEach((c) => c(href));
    };

    const originalPushState = globalScope.history?.pushState?.bind(globalScope.history);
    const originalReplaceState = globalScope.history?.replaceState?.bind(globalScope.history);

    if (globalScope.history && originalPushState && originalReplaceState) {
      globalScope.history.pushState = (state: unknown, title: string, url?: string | URL | null) => {
        originalPushState(state, title, url);
        // Read from location.href after history call so we always notify with resolved absolute URL.
        notify();
      };
      globalScope.history.replaceState = (state: unknown, title: string, url?: string | URL | null) => {
        originalReplaceState(state, title, url);
        // Read from location.href after history call so we always notify with resolved absolute URL.
        notify();
      };
    }
    const onPopStateOrHashChange = (): void => notify();
    globalScope.addEventListener('popstate', onPopStateOrHashChange);
    globalScope.addEventListener('hashchange', onPopStateOrHashChange);

    const cleanup = (): void => {
      // Do not restore history methods: we are not aware of patches applied by other scripts.
      globalScope.removeEventListener('popstate', onPopStateOrHashChange);
      globalScope.removeEventListener('hashchange', onPopStateOrHashChange);
      urlChangeSubscriptionsByScope.delete(globalScope);
    };

    state = { callbacks, cleanup };
    urlChangeSubscriptionsByScope.set(globalScope, state);
  }

  const subscriptionState = state;
  subscriptionState.callbacks.add(onUrlChange);
  return (): void => {
    subscriptionState.callbacks.delete(onUrlChange);
    if (subscriptionState.callbacks.size === 0) {
      subscriptionState.cleanup();
    }
  };
}

/**
 * Creates a URL tracking plugin for rrweb record function
 *
 * This plugin monitors URL changes in the browser and emits events when the URL changes.
 * It supports three tracking modes:
 * 1. Polling (if explicitly enabled) - periodically checks for URL changes
 * 2. History API + Hash routing (default) - patches pushState/replaceState, listens to popstate and hashchange
 * 3. Hash routing only (fallback) - listens to hashchange events when History API is unavailable
 *
 * The plugin handles edge cases gracefully:
 * - Missing or null location objects
 * - Undefined, null, or empty location.href values
 * - Temporal dead zone issues with variable declarations
 * - Consistent URL normalization across all code paths
 *
 * @param options Configuration options for URL tracking
 * @returns RecordPlugin instance that can be used with rrweb
 */
export function createUrlTrackingPlugin(
  options: URLTrackingPluginOptions = {},
): RecordPlugin<URLTrackingPluginOptions> {
  return {
    name: 'amplitude/url-tracking@1',
    observer(cb, globalScope, pluginOptions?: URLTrackingPluginOptions) {
      // Merge options with plugin-level options taking precedence over constructor options
      const config = { ...options, ...pluginOptions };
      const ugcFilterRules = config.ugcFilterRules || [];
      const enablePolling = config.enablePolling ?? false;
      const pollingInterval = config.pollingInterval ?? DEFAULT_URL_CHANGE_POLLING_INTERVAL;
      const captureDocumentTitle = config.captureDocumentTitle ?? false;

      // Early return if no global scope is available
      if (!globalScope) {
        return () => {
          // No cleanup needed if no global scope available
        };
      }

      // Track the last URL to prevent duplicate events
      // Initialize to undefined to ensure first call always emits an event
      let lastTrackedUrl: string | undefined = undefined;

      // Helper functions
      /**
       * Gets the current URL with proper normalization
       * Handles edge cases where location.href might be undefined, null, or empty
       * Ensures consistent behavior across all code paths
       * @returns Normalized URL string (empty string if location unavailable)
       */
      const getCurrentUrl = (): string => {
        if (!globalScope.location) return '';
        return globalScope.location.href || '';
      };

      /**
       * Creates a URL change event with current page information
       * Applies UGC filtering if rules are configured
       * Uses getCurrentUrl() for consistent URL normalization
       * @returns URLChangeEvent with current page state
       */
      const createUrlChangeEvent = (): URLChangeEvent => {
        const { innerHeight, innerWidth, document } = globalScope;
        const currentUrl = getCurrentUrl();
        let currentTitle = '';
        if (captureDocumentTitle) {
          currentTitle = document?.title || '';
        }

        // Apply UGC filtering if rules are provided, otherwise use original URL
        const filteredUrl = ugcFilterRules.length > 0 ? getPageUrl(currentUrl, ugcFilterRules) : currentUrl;

        return {
          href: filteredUrl,
          title: currentTitle,
          viewportHeight: innerHeight,
          viewportWidth: innerWidth,
          type: 'url-change-event',
        };
      };

      /**
       * Emits a URL change event if the URL has actually changed
       * Always emits on first call (when lastTrackedUrl is undefined)
       */
      const emitUrlChange = (): void => {
        const currentUrl = getCurrentUrl();
        if (lastTrackedUrl === undefined || currentUrl !== lastTrackedUrl) {
          lastTrackedUrl = currentUrl;
          const event = createUrlChangeEvent();
          cb(event);
        }
      };

      // Single helper: history + popstate + hashchange, or polling when enabled
      const unsubscribe = subscribeToUrlChanges(
        globalScope as Window,
        () => emitUrlChange(),
        enablePolling ? { enablePolling: true, pollingInterval } : {},
      );
      emitUrlChange();

      return (): void => unsubscribe();
    },
    options,
  };
}

/**
 * Default URL tracking plugin instance with default options
 * Can be used directly without custom configuration
 */
export const urlTrackingPlugin = createUrlTrackingPlugin();
