/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as AnalyticsCore from '@amplitude/analytics-core';
import { MouseInteractions } from '@amplitude/rrweb-types';
import { SessionReplayEventsManager } from '../../src/typings/session-replay';
import { UUID } from '@amplitude/analytics-core';
import { ClickEvent, ClickEventWithCount, clickBatcher, clickHook, clickNonBatcher } from '../../src/hooks/click';
import { record } from '@amplitude/rrweb-record';
import type { ILogger } from '@amplitude/analytics-core';
import { finder } from '../../src/libs/finder';
import { getWindowScroll } from 'src/utils/rrweb';

jest.mock('@amplitude/rrweb-record');
jest.mock('../../src/libs/finder');

describe('click', () => {
  const mockLoggerProvider: ILogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  // Need to mock this in one function, but we want to use the real function everywhere else.
  // If there is a better way to do this in Jest, please refactor this!
  const mockFinder = finder as jest.Mock;
  beforeEach(() => {
    mockFinder.mockImplementation((arg) => {
      const fn = jest.requireActual('../../src/libs/finder');
      return fn.finder(arg);
    });
  });

  describe('clickHook', () => {
    const mockEventsManager: jest.Mocked<SessionReplayEventsManager<'interaction', string>> = {
      sendStoredEvents: jest.fn(),
      addEvent: jest.fn(),
      sendCurrentSequenceEvents: jest.fn(),
      flush: jest.fn(),
    };

    const mockGlobalScope = (globalScope?: Partial<typeof globalThis>) => {
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(globalScope as typeof globalThis);
    };

    const mockWindowScroll = (left = 0, top = 0) => {
      (getWindowScroll as jest.Mock).mockImplementation(() => {
        return { left, top };
      }) as any;
    };

    beforeEach(() => {
      mockWindowScroll();
    });

    afterEach(() => {
      jest.restoreAllMocks();
      jest.resetAllMocks();
    });

    const deviceId = UUID();
    const sessionId = Math.round(Math.random() * 1_000_000);

    const hook = clickHook(mockLoggerProvider, {
      deviceIdFn: () => deviceId,
      eventsManager: mockEventsManager,
      sessionId: sessionId,
    });

    test('do nothing on non click event', () => {
      hook({
        id: 1234,
        type: MouseInteractions.TouchStart,
        x: 3,
        y: 3,
      });
      expect(jest.spyOn(mockEventsManager, 'addEvent')).not.toHaveBeenCalled();
    });
    test('do nothing if x/y is undefined', () => {
      hook({
        id: 1234,
        type: MouseInteractions.Click,
        x: undefined,
        y: undefined,
      });
      expect(jest.spyOn(mockEventsManager, 'addEvent')).not.toHaveBeenCalled();
    });
    test('do nothing if no window given', () => {
      mockGlobalScope(undefined);
      const hook = clickHook(mockLoggerProvider, {
        deviceIdFn: () => deviceId,
        eventsManager: mockEventsManager,
        sessionId: sessionId,
      });
      hook({
        id: 1234,
        type: MouseInteractions.Click,
        x: 3,
        y: 3,
      });
      expect(jest.spyOn(mockEventsManager, 'addEvent')).not.toHaveBeenCalled();
    });
    test('do nothing if no location', () => {
      mockGlobalScope({
        location: undefined,
      });
      const hook = clickHook(mockLoggerProvider, {
        deviceIdFn: () => deviceId,
        eventsManager: mockEventsManager,
        sessionId: sessionId,
      });
      hook({
        id: 1234,
        type: MouseInteractions.Click,
        x: 3,
        y: 3,
      });
      expect(jest.spyOn(mockEventsManager, 'addEvent')).not.toHaveBeenCalled();
    });
    test('add event on click event', () => {
      hook({
        id: 1234,
        type: MouseInteractions.Click,
        x: 3,
        y: 3,
      });
      expect(jest.spyOn(mockEventsManager, 'addEvent')).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockEventsManager.addEvent.mock.calls[0][0].event.data)).toStrictEqual({
        x: 3,
        y: 3,
        viewportHeight: 768,
        viewportWidth: 1024,
        pageUrl: 'http://localhost/',
        timestamp: expect.any(Number),
        type: 'click',
      });
    });
    test('add event on click event with scroll', () => {
      mockWindowScroll(4, 5);
      hook({
        id: 1234,
        type: MouseInteractions.Click,
        x: 3,
        y: 3,
      });
      expect(jest.spyOn(mockEventsManager, 'addEvent')).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockEventsManager.addEvent.mock.calls[0][0].event.data)).toStrictEqual({
        x: 3 + 4,
        y: 3 + 5,
        viewportHeight: 768,
        viewportWidth: 1024,
        pageUrl: 'http://localhost/',
        timestamp: expect.any(Number),
        type: 'click',
      });
    });
    test('add event on click event with selector', () => {
      (record.mirror.getNode as jest.Mock).mockImplementation(() => {
        const ele = document.createElement('div');
        document.body.appendChild(ele);
        return ele;
      }) as any;
      hook({
        id: 1234,
        type: MouseInteractions.Click,
        x: 3,
        y: 3,
      });
      expect(jest.spyOn(mockEventsManager, 'addEvent')).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockEventsManager.addEvent.mock.calls[0][0].event.data)).toStrictEqual({
        x: 3,
        y: 3,
        viewportHeight: 768,
        viewportWidth: 1024,
        pageUrl: 'http://localhost/',
        timestamp: expect.any(Number),
        type: 'click',
        selector: 'div',
      });
    });
    test('no selector info on finder failure', () => {
      const mockFinder = finder as jest.Mock;
      mockFinder.mockImplementation(() => {
        throw new Error('');
      });

      (record.mirror.getNode as jest.Mock).mockImplementation(() => {
        const ele = document.createElement('div');
        document.body.appendChild(ele);
        return ele;
      }) as any;
      const hook = clickHook(mockLoggerProvider, {
        deviceIdFn: () => deviceId,
        eventsManager: mockEventsManager,
        sessionId: sessionId,
      });
      hook({
        id: 1234,
        type: MouseInteractions.Click,
        x: 3,
        y: 3,
      });
      expect(jest.spyOn(mockEventsManager, 'addEvent')).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockEventsManager.addEvent.mock.calls[0][0].event.data)).toStrictEqual({
        x: 3,
        y: 3,
        viewportHeight: 768,
        viewportWidth: 1024,
        pageUrl: 'http://localhost/',
        timestamp: expect.any(Number),
        type: 'click',
      });
    });
  });

  describe('clickBatcher', () => {
    const clickEventFixture = (event: Partial<ClickEvent>): ClickEvent => {
      return {
        pageUrl: 'http://localhost/',
        timestamp: Date.now(),
        type: 'click',
        viewportHeight: 963,
        viewportWidth: 1920,
        x: 3,
        y: 3,
        ...event,
      };
    };

    test('batches events', () => {
      const clickEvents: ClickEvent[] = [
        clickEventFixture({
          x: 3,
          y: 3,
          timestamp: 1718327016000,
        }),
        clickEventFixture({
          x: 3,
          y: 3,
          timestamp: 1718327012000,
        }),
        clickEventFixture({
          x: 4,
          y: 3,
          timestamp: 1718267012000,
        }),
      ];
      const { version, events } = clickBatcher({
        version: 1,
        events: clickEvents.map((clickEvent) => JSON.stringify(clickEvent)),
      });
      expect(version).toBe(1);
      const expectedEvents: ClickEventWithCount[] = [
        {
          ...clickEventFixture({
            timestamp: 1718326800000,
            x: 3,
            y: 3,
          }),
          count: 2,
        },
        {
          ...clickEventFixture({
            timestamp: 1718265600000,
            x: 4,
            y: 3,
          }),
          count: 1,
        },
      ];
      expect(events).toStrictEqual(expectedEvents);
    });
    test('batches events with selectors', () => {
      const clickEvents: ClickEvent[] = [
        clickEventFixture({
          x: 3,
          y: 3,
          selector: '.foo',
          timestamp: 1718227016000,
        }),
        clickEventFixture({
          x: 3,
          y: 3,
          timestamp: 1718217012000,
        }),
        clickEventFixture({
          x: 4,
          y: 3,
          selector: '.bar',
          timestamp: 1717327012000,
        }),
        clickEventFixture({
          x: 4,
          y: 3,
          selector: '.bar',
          timestamp: 1717327012000,
        }),
      ];
      const { version, events } = clickBatcher({
        version: 1,
        events: clickEvents.map((clickEvent) => JSON.stringify(clickEvent)),
      });
      expect(version).toBe(1);
      const expectedEvents: ClickEventWithCount[] = [
        {
          count: 1,
          ...clickEventFixture({
            timestamp: 1718226000000,
            x: 3,
            y: 3,
            selector: '.foo',
          }),
        },
        {
          count: 1,
          ...clickEventFixture({
            timestamp: 1718215200000,
            x: 3,
            y: 3,
          }),
        },
        {
          count: 2,
          ...clickEventFixture({
            timestamp: 1717326000000,
            x: 4,
            y: 3,
            selector: '.bar',
          }),
        },
      ];
      expect(events).toStrictEqual(expectedEvents);
    });
    test('no events in, no events out', () => {
      const { version, events } = clickBatcher({ version: 1, events: [] });
      expect(version).toBe(1);
      expect(events).toStrictEqual([]);
    });
  });

  describe('clickNonBatcher', () => {
    const clickEventFixture = (event: Partial<ClickEvent>): ClickEvent => {
      return {
        pageUrl: 'http://localhost/',
        timestamp: Date.now(),
        type: 'click',
        viewportHeight: 963,
        viewportWidth: 1920,
        x: 3,
        y: 3,
        ...event,
      };
    };

    test('batches events', () => {
      const clickEvents: ClickEvent[] = [
        clickEventFixture({
          x: 3,
          y: 3,
          timestamp: 1718327016000,
        }),
        clickEventFixture({
          x: 3,
          y: 3,
          timestamp: 1718327012000,
        }),
        clickEventFixture({
          x: 4,
          y: 3,
          timestamp: 1718267012000,
        }),
      ];
      const { version, events } = clickNonBatcher({
        version: 1,
        events: clickEvents.map((clickEvent) => JSON.stringify(clickEvent)),
      });
      expect(version).toBe(1);
      const expectedEvents: ClickEventWithCount[] = [
        {
          ...clickEventFixture({
            timestamp: 1718327016000,
            x: 3,
            y: 3,
          }),
          count: 1,
        },
        {
          ...clickEventFixture({
            timestamp: 1718327012000,
            x: 3,
            y: 3,
          }),
          count: 1,
        },
        {
          ...clickEventFixture({
            timestamp: 1718267012000,
            x: 4,
            y: 3,
          }),
          count: 1,
        },
      ];
      expect(events).toStrictEqual(expectedEvents);
    });
    test('batches events with selectors', () => {
      const clickEvents: ClickEvent[] = [
        clickEventFixture({
          x: 3,
          y: 3,
          selector: '.foo',
          timestamp: 1718227016000,
        }),
        clickEventFixture({
          x: 3,
          y: 3,
          timestamp: 1718217012000,
        }),
        clickEventFixture({
          x: 4,
          y: 3,
          selector: '.bar',
          timestamp: 1717327012000,
        }),
        clickEventFixture({
          x: 4,
          y: 3,
          selector: '.bar',
          timestamp: 1717327012000,
        }),
      ];
      const { version, events } = clickNonBatcher({
        version: 1,
        events: clickEvents.map((clickEvent) => JSON.stringify(clickEvent)),
      });
      expect(version).toBe(1);
      const expectedEvents: ClickEventWithCount[] = [
        {
          count: 1,
          ...clickEventFixture({
            timestamp: 1718227016000,
            x: 3,
            y: 3,
            selector: '.foo',
          }),
        },
        {
          count: 1,
          ...clickEventFixture({
            timestamp: 1718217012000,
            x: 3,
            y: 3,
          }),
        },
        {
          count: 1,
          ...clickEventFixture({
            timestamp: 1717327012000,
            x: 4,
            y: 3,
            selector: '.bar',
          }),
        },
        {
          count: 1,
          ...clickEventFixture({
            timestamp: 1717327012000,
            x: 4,
            y: 3,
            selector: '.bar',
          }),
        },
      ];
      expect(events).toStrictEqual(expectedEvents);
    });
    test('no events in, no events out', () => {
      const { version, events } = clickNonBatcher({ version: 1, events: [] });
      expect(version).toBe(1);
      expect(events).toStrictEqual([]);
    });
  });
});
