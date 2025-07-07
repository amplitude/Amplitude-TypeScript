import { getGlobalScope } from '@amplitude/analytics-core';
import { getPageUrl } from '../helpers';
import { UGCFilterRule } from '../config/types';

export interface URLChangeEvent {
  href: string;
  title: string;
}

export type URLChangeCallback = (event: URLChangeEvent) => void;

export class URLTracker {
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;
  private lastTrackedUrl = '';
  private urlChangeInterval: number | null = null;
  private callback: URLChangeCallback | null = null;
  private ugcFilterRules: UGCFilterRule[] = [];
  private isTracking = false;
  private enablePolling = false;

  constructor(
    options: {
      ugcFilterRules?: UGCFilterRule[];
      enablePolling?: boolean;
    } = {},
  ) {
    this.ugcFilterRules = options.ugcFilterRules || [];
    this.enablePolling = options.enablePolling || false;
  }

  start(callback: URLChangeCallback): void {
    if (this.isTracking) {
      return;
    }

    this.callback = callback;
    this.isTracking = true;
    this.setupUrlTracking();
  }

  stop(): void {
    if (!this.isTracking) {
      return;
    }

    this.teardownUrlTracking();
    this.callback = null;
    this.isTracking = false;
  }

  updateConfig(ugcFilterRules: UGCFilterRule[]): void {
    this.ugcFilterRules = ugcFilterRules;
  }

  private emitUrlChange = (): void => {
    if (!this.callback) return;

    const globalScope = getGlobalScope();
    if (!globalScope?.location) return;

    const currentUrl = globalScope.location.href;
    const currentTitle = globalScope.document?.title || '';

    // Only emit if URL actually changed
    if (currentUrl !== this.lastTrackedUrl) {
      this.lastTrackedUrl = currentUrl;

      // Apply UGC filtering to the URL
      const filteredUrl = this.ugcFilterRules.length > 0 ? getPageUrl(currentUrl, this.ugcFilterRules) : currentUrl;

      this.callback({
        href: filteredUrl,
        title: currentTitle,
      });
    }
  };

  private setupUrlTracking(): void {
    const globalScope = getGlobalScope();
    if (!globalScope?.history) return;

    // Store original methods
    this.originalPushState = globalScope.history.pushState.bind(globalScope.history);
    this.originalReplaceState = globalScope.history.replaceState.bind(globalScope.history);

    // Patch pushState
    const originalPushState = this.originalPushState;
    const emitUrlChange = this.emitUrlChange;
    globalScope.history.pushState = function (this: History, ...args: Parameters<typeof history.pushState>) {
      const result = originalPushState.apply(this, args);
      emitUrlChange();
      return result;
    };

    // Patch replaceState
    const originalReplaceState = this.originalReplaceState;
    globalScope.history.replaceState = function (this: History, ...args: Parameters<typeof history.replaceState>) {
      const result = originalReplaceState.apply(this, args);
      emitUrlChange();
      return result;
    };

    // Listen for popstate (back/forward navigation)
    globalScope.addEventListener('popstate', this.emitUrlChange);

    // Optional: Set up polling as fallback for edge cases
    if (this.enablePolling) {
      this.urlChangeInterval = globalScope.setInterval(() => {
        this.emitUrlChange();
      }, 1000) as unknown as number; // Check every second when polling enabled
    }

    // Emit initial URL
    this.emitUrlChange();
  }

  private teardownUrlTracking(): void {
    const globalScope = getGlobalScope();
    if (!globalScope) return;

    // Restore original methods
    if (this.originalPushState) {
      globalScope.history.pushState = this.originalPushState;
      this.originalPushState = null;
    }
    if (this.originalReplaceState) {
      globalScope.history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }

    // Remove popstate listener
    globalScope.removeEventListener('popstate', this.emitUrlChange);

    // Clear polling interval
    if (this.urlChangeInterval) {
      globalScope.clearInterval(this.urlChangeInterval);
      this.urlChangeInterval = null;
    }

    // Reset tracked URL
    this.lastTrackedUrl = '';
  }
}
