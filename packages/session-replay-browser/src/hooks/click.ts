import { mouseInteractionCallBack, MouseInteractions } from '@amplitude/rrweb-types';
import { record } from '@amplitude/rrweb';
import { SessionReplayEventsManager as AmplitudeSessionReplayEventsManager } from '../typings/session-replay';
import { PayloadBatcher } from 'src/track-destination';

type ClickEvent = {
  timestamp: number;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  pageUrl: string;
  selector?: string;
  type: 'click';
};

type ClickEventWithCount = ClickEvent & { count: number };

type Options = {
  sessionId: number;
  deviceIdFn: () => string | undefined;
  eventsManager: AmplitudeSessionReplayEventsManager<'interaction', string>;
  // eslint-disable-next-line no-restricted-globals
  getGlobalScopeFn: () => typeof globalThis | undefined;
};

const HOUR_IN_MILLISECONDS = 3_600_000;

export const clickBatcher: PayloadBatcher<ClickEventWithCount> = ({ version, events }) => {
  const clickEvents: ClickEvent[] = [];
  events.forEach((evt) => {
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

export const clickHook: (options: Options) => mouseInteractionCallBack =
  ({ getGlobalScopeFn, eventsManager, sessionId, deviceIdFn }) =>
  (e) => {
    if (e.type !== MouseInteractions.Click) {
      return;
    }

    const globalScope = getGlobalScopeFn();
    if (!globalScope) {
      return;
    }

    const { location, innerHeight, innerWidth } = globalScope;
    // it only makes sense to send events if a pageUrl exists
    if (!location) {
      return;
    }

    const { x, y } = e;

    const node = record.mirror.getNode(e.id);
    let selector;
    if (node) {
      // selector = finder(node as Element);
      selector = '';
    }

    const evt: ClickEvent = {
      x,
      y,
      selector,

      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
      pageUrl: location.href,
      timestamp: Date.now(),
      type: 'click',
    };
    const deviceId = deviceIdFn();
    if (deviceId) {
      eventsManager.addEvent({ sessionId, event: { type: 'interaction', data: JSON.stringify(evt) }, deviceId });
    }
  };
