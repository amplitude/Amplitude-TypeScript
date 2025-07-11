import { getGlobalScope } from '@amplitude/analytics-core';
import { getPageUrl } from '../helpers';
import { UGCFilterRule } from '../config/types';
import { DEFAULT_URL_CHANGE_POLLING_INTERVAL } from '../constants';

/**
 * Event emitted when URL changes are detected
 */
export interface URLChangeEvent {
  href: string;
  title: string;
  viewportHeight: number;
  viewportWidth: number;
}

/**
 * Callback function type for URL change notifications
 */
export type URLChangeCallback = (event: URLChangeEvent) => void;

// Type alias for global scope to improve type safety
type GlobalScope = NonNullable<ReturnType<typeof getGlobalScope>>;

/**
 * URLTracker monitors URL changes in single-page applications by:
 * 1. Patching browser history methods (pushState, replaceState)
 * 2. Listening for popstate events (back/forward navigation)
 * 3. Optional polling as a fallback for edge cases
 *
 * Features:
 * - Deduplication of identical URL changes
 * - UGC (User Generated Content) filtering for sensitive URLs
 * - Graceful handling of missing browser APIs
 * - Clean teardown with method restoration
 */
export class URLTracker {
  // Store original browser methods to restore them on cleanup
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;

  // Track state to prevent duplicate emissions and manage lifecycle
  private lastTrackedUrl = '';
  private urlChangeInterval: number | null = null;
  private callback: URLChangeCallback | null = null;

  // Configuration
  private ugcFilterRules: UGCFilterRule[] = [];
  private isTracking = false;
  private enablePolling = false;
  private pollingInterval: number;

  /**
   * Create a new URLTracker instance
   * @param options Configuration options
   * @param options.ugcFilterRules Rules for filtering sensitive content from URLs
   * @param options.enablePolling Whether to enable polling as a fallback detection method
   * @param options.pollingInterval Polling interval in milliseconds (default: DEFAULT_URL_CHANGE_POLLING_INTERVAL)
   */
  constructor(
    options: {
      ugcFilterRules?: UGCFilterRule[];
      enablePolling?: boolean;
      pollingInterval?: number;
    } = {},
  ) {
    this.ugcFilterRules = options.ugcFilterRules || [];
    this.enablePolling = options.enablePolling || false;
    this.pollingInterval = options.pollingInterval || DEFAULT_URL_CHANGE_POLLING_INTERVAL;
  }

  /**
   * Start tracking URL changes and call the provided callback when changes occur
   * @param callback Function to call when URL changes are detected
   */
  start(callback: URLChangeCallback): void {
    // Prevent double-initialization
    if (this.isTracking) {
      return;
    }

    this.callback = callback;
    this.isTracking = true;
    this.setupUrlTracking();
  }

  /**
   * Stop tracking URL changes and clean up all patches and listeners
   */
  stop(): void {
    // Nothing to clean up if not tracking
    if (!this.isTracking) {
      return;
    }

    this.teardownUrlTracking();
    this.callback = null;
    this.isTracking = false;
  }

  /**
   * Update the UGC filtering rules without restarting the tracker
   * @param ugcFilterRules New filtering rules to apply
   */
  updateConfig(ugcFilterRules: UGCFilterRule[]): void {
    this.ugcFilterRules = ugcFilterRules;
  }

  /**
   * Emit a URL change event if the URL has actually changed
   * Uses arrow function to preserve 'this' context when called from patched methods
   */
  private emitUrlChange = (): void => {
    // Early return if no callback registered
    if (!this.callback) return;

    const globalScope = getGlobalScope();
    // Bail out if browser doesn't support location API
    if (!globalScope || !globalScope.location) return;

    const { innerHeight, innerWidth, location, document } = globalScope;

    const currentUrl = location.href;
    const currentTitle = document?.title || '';

    // Only emit if URL actually changed to prevent duplicate events
    if (currentUrl !== this.lastTrackedUrl) {
      this.lastTrackedUrl = currentUrl;

      // Apply UGC filtering to sanitize sensitive URLs before emission
      const filteredUrl = this.shouldApplyUgcFiltering() ? getPageUrl(currentUrl, this.ugcFilterRules) : currentUrl;

      this.callback({
        href: filteredUrl,
        title: currentTitle,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
      });
    }
  };

  /**
   * Check if UGC filtering should be applied based on configured rules
   * @returns true if filtering rules exist and should be applied
   */
  private shouldApplyUgcFiltering(): boolean {
    return this.ugcFilterRules.length > 0;
  }

  /**
   * Set up all URL tracking mechanisms:
   * 1. Store original browser methods
   * 2. Patch history methods to detect programmatic navigation
   * 3. Add event listeners for browser navigation
   * 4. Set up optional polling fallback
   * 5. Emit initial URL state
   */
  private setupUrlTracking(): void {
    const globalScope = getGlobalScope();
    // Can't track URLs without browser history API
    if (!globalScope?.history) return;

    this.storeOriginalHistoryMethods(globalScope);
    this.patchHistoryMethods(globalScope);
    this.setupEventListeners(globalScope);
    this.setupPolling(globalScope);

    // Emit initial URL to establish baseline
    this.emitUrlChange();
  }

  /**
   * Store references to original browser history methods before patching
   * This allows us to restore them during cleanup and call them from our patches
   * @param globalScope The global scope containing the history API
   */
  private storeOriginalHistoryMethods(globalScope: GlobalScope): void {
    this.originalPushState = globalScope.history.pushState.bind(globalScope.history);
    this.originalReplaceState = globalScope.history.replaceState.bind(globalScope.history);
  }

  /**
   * Patch browser history methods to detect programmatic URL changes
   * SPA frameworks use these methods to navigate without page reloads
   * @param globalScope The global scope containing the history API
   */
  private patchHistoryMethods(globalScope: GlobalScope): void {
    // Patch pushState (used for new history entries)
    globalScope.history.pushState = this.createHistoryMethodPatch(this.originalPushState);

    // Patch replaceState (used for replacing current history entry)
    globalScope.history.replaceState = this.createHistoryMethodPatch(this.originalReplaceState);
  }

  /**
   * Create a generic patch for history methods that preserves original functionality
   * while adding URL change detection
   * @param originalMethod The original browser method to wrap
   * @returns Patched method that calls original and emits URL changes
   */
  private createHistoryMethodPatch<T extends typeof history.pushState | typeof history.replaceState>(
    originalMethod: T | null,
  ) {
    const emitUrlChange = this.emitUrlChange;
    return function (this: History, ...args: Parameters<T>) {
      // Call original method first (may be null in edge cases)
      const result = originalMethod?.apply(this, args);
      // Then emit URL change event
      emitUrlChange();
      return result;
    };
  }

  /**
   * Set up event listeners for browser-initiated navigation
   * @param globalScope The global scope to attach listeners to
   */
  private setupEventListeners(globalScope: GlobalScope): void {
    // Listen for popstate (back/forward navigation, bookmark navigation)
    globalScope.addEventListener('popstate', this.emitUrlChange);
  }

  /**
   * Set up optional polling as a fallback for URL change detection
   * Some edge cases or browser bugs might not trigger our other detection methods
   * @param globalScope The global scope for setting intervals
   */
  private setupPolling(globalScope: GlobalScope): void {
    if (this.enablePolling) {
      this.urlChangeInterval = globalScope.setInterval(() => {
        this.emitUrlChange();
      }, this.pollingInterval) as unknown as number;
    }
  }

  /**
   * Clean up all tracking mechanisms and restore original browser state
   */
  private teardownUrlTracking(): void {
    const globalScope = getGlobalScope();
    // Nothing to clean up if browser APIs unavailable
    if (!globalScope) return;

    this.restoreOriginalHistoryMethods(globalScope);
    this.removeEventListeners(globalScope);
    this.clearPolling(globalScope);
    this.resetState();
  }

  /**
   * Restore original browser history methods to their unpatched state
   * This prevents memory leaks and restores normal browser behavior
   * @param globalScope The global scope containing the history API
   */
  private restoreOriginalHistoryMethods(globalScope: GlobalScope): void {
    if (this.originalPushState) {
      globalScope.history.pushState = this.originalPushState;
      this.originalPushState = null;
    }
    if (this.originalReplaceState) {
      globalScope.history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }
  }

  /**
   * Remove all event listeners that were added during setup
   * @param globalScope The global scope to remove listeners from
   */
  private removeEventListeners(globalScope: GlobalScope): void {
    globalScope.removeEventListener('popstate', this.emitUrlChange);
  }

  /**
   * Clear any active polling intervals
   * @param globalScope The global scope for clearing intervals
   */
  private clearPolling(globalScope: GlobalScope): void {
    if (this.urlChangeInterval) {
      globalScope.clearInterval(this.urlChangeInterval);
      this.urlChangeInterval = null;
    }
  }

  /**
   * Reset internal tracking state
   */
  private resetState(): void {
    this.lastTrackedUrl = '';
  }
}
