/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { MouseInteractions } from '@amplitude/rrweb-types';
import { SessionReplayEventsManager } from '../../src/typings/session-replay';
import { UUID } from '@amplitude/analytics-core';
import { clickHook } from '../../src/hooks/click';
import { record } from '@amplitude/rrweb';

jest.mock('@amplitude/rrweb');

describe('click', () => {
  const mockEventsManager: jest.Mocked<SessionReplayEventsManager<'interaction', string>> = {
    sendStoredEvents: jest.fn(),
    addEvent: jest.fn(),
    sendCurrentSequenceEvents: jest.fn(),
    flush: jest.fn(),
  };

  const deviceId = UUID();
  const sessionId = Math.round(Math.random() * 1_000_000);

  const hook = clickHook({
    deviceIdFn: () => deviceId,
    getGlobalScopeFn: () => window,
    eventsManager: mockEventsManager,
    sessionId: sessionId,
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('clickHook', () => {
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
    test('it should do the thing', () => {
      expect(true).toBe(true);
    });
  });
});
