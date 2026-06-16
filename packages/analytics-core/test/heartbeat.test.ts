import Heartbeat from '../src/heartbeat';
import { CoreClient } from '../src/types/client/core-client';

describe('heartbeat', () => {
  let mockClient: CoreClient;
  let trackMock: jest.Mock;
  let heartbeat: Heartbeat;

  beforeEach(() => {
    jest.useFakeTimers();
    trackMock = jest.fn().mockReturnValue({
      promise: Promise.resolve({ event: { event_id: 1 } }),
    });
    mockClient = {
      track: trackMock,
    } as unknown as CoreClient;
    heartbeat = new Heartbeat(mockClient, 1000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('track, update and cancel', () => {
    test('should track an event', async () => {
      const event = {
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);
      expect(trackMock).toHaveBeenCalledWith(event.event_type, event.event_properties, {
        insert_id: expect.any(String),
        delay_id: expect.any(String),
      });
      expect(trackMock).toHaveBeenCalledTimes(1);
    });

    test('should be able to update a previously tracked event', async () => {
      const event = {
        insert_id: '12345',
        event_type: 'test',
        event_properties: { test: 'stale' },
      };
      await heartbeat.track(event);
      expect(trackMock).toHaveBeenCalledWith(
        event.event_type,
        { test: 'stale' },
        {
          insert_id: '12345',
          delay_id: expect.any(String),
        },
      );
      expect(trackMock).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(10);
      event.event_properties.test = 'updated';
      await heartbeat.update(event);
      jest.advanceTimersByTime(1001);
      expect(trackMock).toHaveBeenCalledTimes(2);
      expect(trackMock).toHaveBeenNthCalledWith(
        2,
        event.event_type,
        { test: 'updated' },
        {
          insert_id: '12345',
          delay_id: expect.any(String) as string,
        },
      );
    });

    test('should be able to cancel a previously tracked event', async () => {
      const event = {
        insert_id: '12345',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);
      expect(trackMock).toHaveBeenCalledWith(event.event_type, event.event_properties, {
        insert_id: '12345',
        delay_id: expect.any(String),
      });
      expect(trackMock).toHaveBeenCalledTimes(1);
      await heartbeat.cancel(event);
      jest.advanceTimersByTime(1000);
      expect(trackMock).toHaveBeenCalledTimes(1);
    });

    test('does nothing if updating an event that is not tracked', async () => {
      const event = {
        insert_id: '12345',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.update(event);
      expect(trackMock).not.toHaveBeenCalled();
    });
  });

  describe('kitchen sink', () => {
    test('should be able to track, update and cancel a series of events', async () => {
      const events = [
        { insert_id: '1', event_type: 'test1', event_properties: { test: 'test1' } },
        { insert_id: '2', event_type: 'test2', event_properties: { test: 'test2' } },
        { insert_id: '3', event_type: 'test3', event_properties: { test: 'test3' } },
      ];
      for (const event of events) {
        await heartbeat.track(event);
      }
      expect(trackMock).toHaveBeenCalledTimes(events.length * 2);
      jest.clearAllMocks();
      jest.advanceTimersByTime(1000);
      expect(trackMock).toHaveBeenCalledTimes(events.length);

      // update event 2
      events[1].event_properties.test = 'test2-updated';
      await heartbeat.update(events[1]);
      expect(trackMock).toHaveBeenNthCalledWith(
        2,
        events[1].event_type,
        { test: 'test2-updated' },
        {
          insert_id: '2',
          delay_id: expect.any(String) as string,
        },
      );

      // cancel event 3
      jest.clearAllMocks();
      await heartbeat.cancel(events[2]);
      expect(trackMock).toHaveBeenCalledTimes(events.length - 1);
      jest.advanceTimersByTime(1000);
      expect(trackMock).toHaveBeenCalledTimes((events.length - 1) * 2);
    });
  });
});
