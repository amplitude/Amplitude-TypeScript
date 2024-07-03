import { scrollCallback, scrollPosition } from '@amplitude/rrweb-types';
import { BeaconTransport } from './beacon';
import { getGlobalScope } from '@amplitude/analytics-client-common';
import { utils } from '@amplitude/rrweb';

const { getWindowHeight, getWindowWidth } = utils;

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

export class ScrollWatcher {
  private _maxScrollX: number;
  private _maxScrollY: number;
  private _maxScrollWidth: number;
  private _maxScrollHeight: number;
  private readonly transport: BeaconTransport<ScrollEvent>;

  constructor(transport: BeaconTransport<ScrollEvent>) {
    this._maxScrollX = 0;
    this._maxScrollY = 0;
    this._maxScrollWidth = getWindowWidth();
    this._maxScrollHeight = getWindowHeight();

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
    if (e.x > this._maxScrollX) {
      const width = getWindowWidth();
      this._maxScrollX = e.x;
      const maxScrollWidth = e.x + width;
      if (maxScrollWidth > this._maxScrollWidth) {
        this._maxScrollWidth = maxScrollWidth;
      }
    }

    if (e.y > this._maxScrollY) {
      const height = getWindowHeight();
      this._maxScrollY = e.y;
      const maxScrollHeight = e.y + height;
      if (maxScrollHeight > this._maxScrollHeight) {
        this._maxScrollHeight = maxScrollHeight;
      }
    }
  }

  hook: scrollCallback = (e: scrollPosition) => {
    this.update(e);
  };

  send: (_: PageTransitionEvent | Event) => void = (_) => {
    const globalScope = getGlobalScope();
    globalScope &&
      this.transport.send({
        maxScrollX: this._maxScrollX,
        maxScrollY: this._maxScrollY,
        maxScrollWidth: this._maxScrollWidth,
        maxScrollHeight: this._maxScrollHeight,

        viewportHeight: getWindowHeight(),
        viewportWidth: getWindowWidth(),
        pageUrl: globalScope.location.href,
        timestamp: Date.now(),
        type: 'scroll',
      });
  };
}
