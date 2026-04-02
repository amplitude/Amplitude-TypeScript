/* eslint-disable @typescript-eslint/no-this-alias -- singleton test double */
import type { VideoObserverParams, VideoState } from '@amplitude/analytics-core';

/** Last instance constructed (cleared by {@link resetMockVideoObserver}). */
export let currentVideoObserver: MockVideoObserver | undefined;

export function resetMockVideoObserver(): void {
  currentVideoObserver = undefined;
}

/**
 * Lightweight stand-in for {@link VideoObserver} in unit tests (no DOM / trackHtmlVideo).
 */
export class MockVideoObserver {
  readonly videoEl: VideoObserverParams['videoEl'];

  private isDestroyed = false;

  readonly vendor: VideoObserverParams['vendor'];

  readonly isEmbedded: VideoObserverParams['isEmbedded'];

  private readonly onStateChange: VideoObserverParams['onStateChange'];

  constructor({ videoEl, onStateChange, vendor, isEmbedded }: VideoObserverParams) {
    this.videoEl = videoEl;
    this.onStateChange = onStateChange;
    this.vendor = vendor;
    this.isEmbedded = isEmbedded;
    currentVideoObserver = this;
  }

  emitStateChange(previousState: VideoState, nextState: VideoState): void {
    if (this.isDestroyed) {
      return;
    }
    this.onStateChange(previousState, nextState);
  }

  destroy(): void {
    this.isDestroyed = true;
  }
}
