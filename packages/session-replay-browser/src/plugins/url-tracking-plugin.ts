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
       * Prevents duplicate events for the same URL on subsequent calls
       * Handles edge cases like undefined/null/empty URLs gracefully
       */
      const emitUrlChange = (): void => {
        const currentUrl = getCurrentUrl();

        // Always emit on first call, or if URL actually changed
        if (lastTrackedUrl === undefined || currentUrl !== lastTrackedUrl) {
          lastTrackedUrl = currentUrl;
          const event = createUrlChangeEvent();
          cb(event);
        }
      };

      /**
       * Creates a patched version of history methods (pushState/replaceState)
       * that calls the original method and then emits a URL change event
       * Ensures URL changes are detected even when history methods are called programmatically
       * @param originalMethod The original history method to patch
       * @returns Patched function that calls original method then emits URL change event
       */
      const createHistoryMethodPatch = <T extends typeof history.pushState | typeof history.replaceState>(
        originalMethod: T,
      ) => {
        return function (this: History, ...args: Parameters<T>) {
          // Call the original history method first
          const result = originalMethod.apply(this, args);
          // Then emit URL change event
          emitUrlChange();
          return result;
        };
      };

      // Hashchange event handler - delegates to emitUrlChange for consistency
      const hashChangeHandler = () => {
        emitUrlChange();
      };

      // 1. if explicitly enable polling → use polling
      if (enablePolling) {
        // Use polling (covers everything)
        const urlChangeInterval = globalScope.setInterval(() => {
          emitUrlChange();
        }, pollingInterval);

        // Emit initial URL immediately
        emitUrlChange();

        // Return cleanup function to stop polling
        return () => {
          if (urlChangeInterval) {
            globalScope.clearInterval(urlChangeInterval);
          }
        };
      }

      // 2. if polling not enabled → check history, if exist, use history
      if (globalScope.history) {
        // Use History API + hashchange (covers History API + hash routing)
        // Store original history methods for restoration during cleanup
        const originalPushState = globalScope.history.pushState.bind(globalScope.history);
        const originalReplaceState = globalScope.history.replaceState.bind(globalScope.history);

        /**
         * Sets up history method patching to intercept pushState and replaceState calls
         * This ensures URL changes are detected even when history methods are called programmatically
         */
        const setupHistoryPatching = (): void => {
          // Patch pushState to emit URL change events
          globalScope.history.pushState = createHistoryMethodPatch(originalPushState);

          // Patch replaceState to emit URL change events
          globalScope.history.replaceState = createHistoryMethodPatch(originalReplaceState);
        };

        // Apply history method patches
        setupHistoryPatching();

        // Listen to popstate events for browser back/forward navigation
        globalScope.addEventListener('popstate', emitUrlChange);
        // Listen to hashchange events for hash routing
        globalScope.addEventListener('hashchange', hashChangeHandler);

        // Emit initial URL immediately
        emitUrlChange();

        // Return cleanup function to restore original state
        return () => {
          // Restore original history methods
          globalScope.history.pushState = originalPushState;
          globalScope.history.replaceState = originalReplaceState;

          // Remove popstate event listener
          globalScope.removeEventListener('popstate', emitUrlChange);
          // Remove hashchange event listener
          globalScope.removeEventListener('hashchange', hashChangeHandler);
        };
      }

      // 3. if not, then the framework is probably using hash router → do hash
      // Fallback: just hashchange (for pure hash routing)
      globalScope.addEventListener('hashchange', hashChangeHandler);
      emitUrlChange();
      return () => {
        globalScope.removeEventListener('hashchange', hashChangeHandler);
      };
    },
    options,
  };
}

/**
 * Default URL tracking plugin instance with default options
 * Can be used directly without custom configuration
 */
export const urlTrackingPlugin = createUrlTrackingPlugin();
