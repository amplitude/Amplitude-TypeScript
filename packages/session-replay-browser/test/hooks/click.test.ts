/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { MouseInteractions } from '@amplitude/rrweb-types';
import { SessionReplayEventsManager } from '../../src/typings/session-replay';
import { UUID } from '@amplitude/analytics-core';
import { ClickEvent, ClickEventWithCount, clickBatcher, clickHook } from '../../src/hooks/click';
import { record } from '@amplitude/rrweb';

jest.mock('@amplitude/rrweb');

describe('click', () => {
  describe('clickHook', () => {
    const mockEventsManager: jest.Mocked<SessionReplayEventsManager<'interaction', string>> = {
      sendStoredEvents: jest.fn(),
      addEvent: jest.fn(),
      sendCurrentSequenceEvents: jest.fn(),
      flush: jest.fn(),
    };

    afterEach(() => {
      jest.resetAllMocks();
    });

    const deviceId = UUID();
    const sessionId = Math.round(Math.random() * 1_000_000);

    const hook = clickHook({
      deviceIdFn: () => deviceId,
      getGlobalScopeFn: () => window,
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
    test('do nothing if no window given', () => {
      const hook = clickHook({
        deviceIdFn: () => deviceId,
        getGlobalScopeFn: () => undefined,
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
      const mockWindow = jest.fn().mockImplementation(() => ({
        location: undefined,
      })) as unknown as typeof globalThis;
      const hook = clickHook({
        deviceIdFn: () => deviceId,
        getGlobalScopeFn: () => mockWindow,
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
      expect(JSON.parse(mockEventsManager.addEvent.mock.calls[0][0].event.data)).toStrictEqual({
        x: 3,
        y: 3,
        viewportHeight: 768,
        viewportWidth: 1024,
        pageUrl: 'http://localhost/',
        timestamp: expect.any(Number),
        type: 'click',
      });
      expect(jest.spyOn(mockEventsManager, 'addEvent')).toHaveBeenCalledTimes(1);
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
      expect(jest.spyOn(mockEventsManager, 'addEvent')).toHaveBeenCalledTimes(1);
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
});
