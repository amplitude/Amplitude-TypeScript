import type { mouseInteractionCallBack } from '@amplitude/rrweb-types';
import { MouseInteractions } from '@amplitude/rrweb-types';
import { Mirror } from '../utils/rrweb';
import { SessionReplayEventsManager as AmplitudeSessionReplayEventsManager } from '../typings/session-replay';
import { PayloadBatcher } from '../track-destination';
import { finder, Options as FinderOptions } from '../libs/finder';
import { getGlobalScope, ILogger } from '@amplitude/analytics-core';
import { UGCFilterRule, InteractionPerformanceConfig } from '../config/types';
import { getPageUrl } from '../helpers';
import { ScrollWatcher } from './scroll';

// exported for testing
export type ClickEvent = {
  timestamp: number;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  pageUrl: string;
  selector?: string;
  type: 'click';
};

// exported for testing
export type ClickEventWithCount = ClickEvent & { count: number };

type Context = {
  sessionId: string | number;
  deviceIdFn: () => string | undefined;
  eventsManager: AmplitudeSessionReplayEventsManager<'interaction', string>;
  mirror: Mirror;
  ugcFilterRules: UGCFilterRule[];
  performanceOptions?: InteractionPerformanceConfig;
};

const HOUR_IN_MILLISECONDS = 3_600_000;

export const clickNonBatcher: PayloadBatcher = ({ version, events }) => {
  const clickEvents: ClickEvent[] = [];
  events.forEach((evt: string) => {
    const record = JSON.parse(evt) as Record<string, unknown>;
    record.count = 1;
    if (record.type === 'click') {
      clickEvents.push(record as ClickEvent);
    }
  });
  return { version, events: clickEvents };
};

export const clickBatcher: PayloadBatcher = ({ version, events }) => {
  const clickEvents: ClickEvent[] = [];
  events.forEach((evt: string) => {
    const record = JSON.parse(evt) as Record<string, unknown>;
    if (record.type === 'click') {
      clickEvents.push(record as ClickEvent);
    }
  });

  const reduced = clickEvents.reduce<Record<string, ClickEventWithCount>>((prev, curr) => {
    const { x, y, selector, timestamp } = curr;

    // round down to nearest hour.
    const hour = timestamp - (timestamp % HOUR_IN_MILLISECONDS);

    const k = `${x}:${y}:${selector ?? ''}:${hour}`;
    if (!prev[k]) {
      prev[k] = { ...curr, timestamp: hour, count: 1 };
    } else {
      prev[k].count += 1;
    }
    return prev;
  }, {});

  return { version, events: Object.values(reduced) };
};

export class ClickHandler {
  private readonly logger: ILogger;
  private readonly scrollWatcher: ScrollWatcher;

  constructor(logger: ILogger, scrollWatcher: ScrollWatcher) {
    this.logger = logger;
    this.scrollWatcher = scrollWatcher;
  }

  createHook: (context: Context) => mouseInteractionCallBack = ({
    eventsManager,
    sessionId,
    deviceIdFn,
    mirror,
    ugcFilterRules,
    performanceOptions,
  }) => {
    return (e) => {
      if (e.type !== MouseInteractions.Click) {
        return;
      }

      const globalScope = getGlobalScope();
      if (!globalScope) {
        return;
      }

      const { location, innerHeight, innerWidth } = globalScope;
      // it only makes sense to send events if a pageUrl exists
      if (!location) {
        return;
      }

      const { x, y } = e;
      if (x === undefined || y === undefined) {
        return;
      }

      const node = mirror.getNode(e.id);
      let selector;
      if (node) {
        try {
          selector = finder(
            node as Element,
            performanceOptions as Pick<FinderOptions, 'timeoutMs' | 'maxNumberOfTries' | 'threshold'>,
          );
        } catch (err) {
          this.logger.debug('error resolving selector from finder');
        }
      }

      const pageUrl = getPageUrl(location.href, ugcFilterRules);

      const event: ClickEvent = {
        x: x + this.scrollWatcher.currentScrollX,
        y: y + this.scrollWatcher.currentScrollY,
        selector,

        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
        pageUrl,
        timestamp: Date.now(),
        type: 'click',
      };
      const deviceId = deviceIdFn();
      if (deviceId) {
        eventsManager.addEvent({ sessionId, event: { type: 'interaction', data: JSON.stringify(event) }, deviceId });
      }
    };
  };
}
