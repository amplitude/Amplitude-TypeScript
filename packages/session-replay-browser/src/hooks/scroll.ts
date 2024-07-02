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
  private maxScrollX: number;
  private maxScrollY: number;
  private maxScrollWidth: number;
  private maxScrollHeight: number;
  private readonly transport: BeaconTransport<ScrollEvent>;

  constructor(transport: BeaconTransport<ScrollEvent>) {
    this.maxScrollX = 0;
    this.maxScrollY = 0;
    this.maxScrollWidth = getWindowWidth();
    this.maxScrollHeight = getWindowHeight();

    this.transport = transport;
  }

  update(e: scrollPosition) {
    if (e.x > this.maxScrollX) {
      const width = getWindowWidth();
      this.maxScrollX = e.x;
      const maxScrollWidth = e.x + width;
      if (maxScrollWidth > this.maxScrollWidth) {
        this.maxScrollWidth = maxScrollWidth;
      }
    }

    if (e.y > this.maxScrollY) {
      const height = getWindowHeight();
      this.maxScrollY = e.y;
      const maxScrollHeight = e.y + height;
      if (maxScrollHeight > this.maxScrollHeight) {
        this.maxScrollHeight = maxScrollHeight;
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
        maxScrollX: this.maxScrollX,
        maxScrollY: this.maxScrollY,
        maxScrollWidth: this.maxScrollWidth,
        maxScrollHeight: this.maxScrollHeight,

        viewportHeight: getWindowHeight(),
        viewportWidth: getWindowWidth(),
        pageUrl: globalScope.location.href,
        timestamp: Date.now(),
        type: 'scroll',
      });
  };
}
