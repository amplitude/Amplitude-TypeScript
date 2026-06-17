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
    heartbeat = new Heartbeat(mockClient, 1000, 1000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('track, update and flush', () => {
    test('should track an event', async () => {
      const event = {
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);
      expect(trackMock).toHaveBeenCalledWith(event.event_type, event.event_properties, {
        insert_id: expect.any(String),
        delay_id: expect.any(String),
        delay_timeout: 1000,
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
          delay_timeout: 1000,
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
          delay_timeout: 1000,
        },
      );
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

    test('should preserve existing insert_id, delay_id and delay_timeout on track', async () => {
      const event = {
        insert_id: 'existing-id',
        delay_id: 'existing-delay',
        delay_timeout: 2000,
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);
      expect(trackMock).toHaveBeenCalledWith(event.event_type, event.event_properties, {
        insert_id: 'existing-id',
        delay_id: 'existing-delay',
        delay_timeout: 2000,
      });
    });

    test('should return the track result for the tracked event', async () => {
      const event = {
        insert_id: 'abc',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      const trackResult = { event: { insert_id: 'abc', event_id: 1 }, code: 200 };
      trackMock.mockReturnValue({ promise: Promise.resolve(trackResult) });
      const result = await heartbeat.track(event);
      expect(result).toEqual(trackResult);
    });

    test('should track an event without delay via trackNoDelay', async () => {
      const event = {
        event_type: 'instant',
        event_properties: { test: 'test' },
      };
      await heartbeat.trackNoDelay(event);
      expect(trackMock).toHaveBeenCalledWith({
        insert_id: expect.any(String),
        delay_id: expect.any(String),
        event_type: 'instant',
        event_properties: { test: 'test' },
      });
    });

    test('should preserve existing insert_id and delay_id on trackNoDelay', async () => {
      const event = {
        insert_id: 'instant-1',
        delay_id: 'delay-1',
        delay_timeout: 1000,
        event_type: 'instant',
        event_properties: { test: 'test' },
      };
      await heartbeat.trackNoDelay(event);
      expect(event.delay_timeout).toBeUndefined();
      expect(trackMock).toHaveBeenCalledWith({
        insert_id: 'instant-1',
        delay_id: 'delay-1',
        event_type: 'instant',
        event_properties: { test: 'test' },
      });
    });

    test('should handle flush when no events are tracked', async () => {
      const result = await heartbeat.flush();
      expect(result).toEqual([]);
      expect(trackMock).not.toHaveBeenCalled();
    });
  });

  describe('kitchen sink', () => {
    test('should be able to track, update and flush a series of events', async () => {
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
          delay_timeout: 1000,
        },
      );

      // flush all events with delay_timeout 0
      jest.clearAllMocks();
      await heartbeat.flush();
      expect(trackMock).toHaveBeenCalledTimes(events.length);
      for (const event of events) {
        expect(trackMock).toHaveBeenCalledWith(
          event.event_type,
          event.event_properties,
          expect.objectContaining({
            insert_id: event.insert_id,
            delay_timeout: 0,
          }),
        );
      }
      jest.advanceTimersByTime(1000);
      expect(trackMock).toHaveBeenCalledTimes(events.length);
    });
  });
});
