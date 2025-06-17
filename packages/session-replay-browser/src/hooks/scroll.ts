import { getWindowHeight, getWindowWidth } from '../utils/rrweb';
import type { scrollCallback, scrollPosition } from '@amplitude/rrweb-types';
import { BeaconTransport } from '../beacon-transport';
import { getGlobalScope } from '@amplitude/analytics-core';
import { SessionReplayJoinedConfig } from '../config/types';
import { SessionReplayDestinationSessionMetadata } from '../typings/session-replay';
import { getPageUrl } from '../helpers';

export type ScrollEvent = {
  timestamp: number; // Timestamp the event occurred
  maxScrollX: number; // Max window scroll X on a page
  maxScrollY: number; // Max window scroll Y on a page
  maxScrollHeight: number; // Max window scroll Y + window height on a page
  maxScrollWidth: number; // Max window scroll X + window width on a page
  viewportWidth: number;
  viewportHeight: number;
  pageUrl: string;
  type: 'scroll';
};

export type ScrollEventPayload = { version: number; events: ScrollEvent[] };

/**
 * This is intended to watch and update max scroll activity when loaded for a particular page.
 * A new instance should be created if the page URL changes, since by default it does not reset
 * it's max scroll state. It is intended to send very few and very small events utilizing the
 * Beacon API.
 * @see {@link BeaconTransport} for more details on Beacon API usage.
 */
export class ScrollWatcher {
  private timestamp = Date.now();
  private _maxScrollX: number;
  private _maxScrollY: number;
  private _maxScrollWidth: number;
  private _maxScrollHeight: number;
  private readonly transport: BeaconTransport<ScrollEventPayload>;
  private readonly config: Pick<SessionReplayJoinedConfig, 'loggerProvider' | 'interactionConfig'>;

  static default(
    context: Omit<SessionReplayDestinationSessionMetadata, 'deviceId'>,
    config: SessionReplayJoinedConfig,
  ): ScrollWatcher {
    return new ScrollWatcher(new BeaconTransport<ScrollEventPayload>(context, config), config);
  }

  constructor(
    transport: BeaconTransport<ScrollEventPayload>,
    config: Pick<SessionReplayJoinedConfig, 'loggerProvider' | 'interactionConfig'>,
  ) {
    this._maxScrollX = 0;
    this._maxScrollY = 0;
    this._maxScrollWidth = getWindowWidth();
    this._maxScrollHeight = getWindowHeight();
    this.config = config;

    this.transport = transport;
  }

  public get maxScrollX(): number {
    return this._maxScrollX;
  }

  public get maxScrollY(): number {
    return this._maxScrollY;
  }

  public get maxScrollWidth(): number {
    return this._maxScrollWidth;
  }

  public get maxScrollHeight(): number {
    return this._maxScrollHeight;
  }

  update(e: scrollPosition) {
    const now = Date.now();
    if (e.x > this._maxScrollX) {
      const width = getWindowWidth();
      this._maxScrollX = e.x;
      const maxScrollWidth = e.x + width;
      if (maxScrollWidth > this._maxScrollWidth) {
        this._maxScrollWidth = maxScrollWidth;
      }
      this.timestamp = now;
    }

    if (e.y > this._maxScrollY) {
      const height = getWindowHeight();
      this._maxScrollY = e.y;
      const maxScrollHeight = e.y + height;
      if (maxScrollHeight > this._maxScrollHeight) {
        this._maxScrollHeight = maxScrollHeight;
      }
      this.timestamp = now;
    }
  }

  hook: scrollCallback = (e: scrollPosition) => {
    this.update(e);
  };

  send: (deviceIdFn: () => string | undefined) => (_: PageTransitionEvent | Event) => void = (deviceIdFn) => (_) => {
    const deviceId = deviceIdFn();
    const globalScope = getGlobalScope();
    if (globalScope && deviceId) {
      this.transport.send(deviceId, {
        version: 1,
        events: [
          {
            maxScrollX: this._maxScrollX,
            maxScrollY: this._maxScrollY,
            maxScrollWidth: this._maxScrollWidth,
            maxScrollHeight: this._maxScrollHeight,

            viewportHeight: getWindowHeight(),
            viewportWidth: getWindowWidth(),
            pageUrl: getPageUrl(globalScope.location.href, this.config.interactionConfig?.ugcFilterRules ?? []),
            timestamp: this.timestamp,
            type: 'scroll',
          },
        ],
      });
    }
  };
}
