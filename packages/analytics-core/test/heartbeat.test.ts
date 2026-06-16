import { Heartbeat } from '../src/heartbeat';
import { getHeartbeatInstance } from '../src/';
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

  describe('track, update and trackNoDelay', () => {
    test('should track an event', async () => {
      const event = {
        insert_id: '12345',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);
      expect(trackMock).toHaveBeenCalledWith(event.event_type, event.event_properties, {
        insert_id: expect.any(String),
        delay: { id: expect.any(String), timeout: 1000 },
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
          delay: { id: expect.any(String), timeout: 1000 },
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
          delay: { id: expect.any(String) as string, timeout: 1000 },
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

    test('should preserve existing insert_id and delay on track', async () => {
      const event = {
        insert_id: 'existing-id',
        delay: { id: 'existing-delay', timeout: 2000 },
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);
      expect(trackMock).toHaveBeenCalledWith(event.event_type, event.event_properties, {
        insert_id: 'existing-id',
        delay: { id: 'existing-delay', timeout: 2000 },
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
        insert_id: '12345',
        event_type: 'instant',
        event_properties: { test: 'test' },
      };
      await heartbeat.trackNoDelay(event);
      expect(trackMock).toHaveBeenCalledWith(
        'instant',
        { test: 'test' },
        {
          insert_id: expect.any(String),
          delay: { id: expect.any(String) },
        },
      );
    });

    test('should preserve existing insert_id and use heartbeat delay_id on trackNoDelay', async () => {
      const event = {
        insert_id: 'instant-1',
        delay: { id: 'delay-1', timeout: 1000 } as { id: string; timeout?: number },
        event_type: 'instant',
        event_properties: { test: 'test' },
      };
      await heartbeat.trackNoDelay(event);
      expect(event.delay.timeout).toBeUndefined();
      expect(trackMock).toHaveBeenCalledWith(
        'instant',
        { test: 'test' },
        {
          insert_id: 'instant-1',
          delay: { id: expect.any(String) },
        },
      );
      expect(event.delay.id).not.toBe('delay-1');
    });

    test('should track via trackNoDelay when no other events are tracked', async () => {
      trackMock.mockReturnValue({
        promise: Promise.resolve({ event: { insert_id: '1', event_id: 1 } }),
      });
      const result = await heartbeat.trackNoDelay({
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      });
      expect(result).toEqual({ event: { insert_id: '1', event_id: 1 } });
      expect(trackMock).toHaveBeenCalledWith(
        'test',
        { test: 'test' },
        {
          insert_id: '1',
          delay: { id: expect.any(String) },
        },
      );
    });

    test('should remove instant events from tracking after successful ingest', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);
      jest.clearAllMocks();

      await heartbeat.trackNoDelay(event);
      await Promise.resolve();
      jest.clearAllMocks();

      jest.advanceTimersByTime(1000);
      expect(trackMock).not.toHaveBeenCalled();
    });

    test('should return an error if insert_id is not provided', async () => {
      const event = {
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      const result = await heartbeat.track(event);
      expect(result).toBeInstanceOf(Error);
      expect(result?.message).toBe('insert_id is required on events tracked with heartbeat');
    });
  });

  describe('stop', () => {
    test('should stop the interval so no further heartbeats fire', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);
      expect(trackMock).toHaveBeenCalledTimes(1);

      heartbeat.stop();

      jest.advanceTimersByTime(5000);
      expect(trackMock).toHaveBeenCalledTimes(1);
    });

    test('should clear tracked events so a subsequent trackNoDelay does not heartbeat remaining events', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);

      heartbeat.stop();
      jest.clearAllMocks();
      trackMock.mockReturnValue({
        promise: Promise.resolve({ event: { insert_id: '1', event_id: 1 } }),
      });

      const result = await heartbeat.trackNoDelay(event);
      expect(result).toEqual({ event: { insert_id: '1', event_id: 1 } });
      expect(trackMock).toHaveBeenCalledTimes(1);
      expect(trackMock).toHaveBeenCalledWith(
        'test',
        { test: 'test' },
        {
          insert_id: '1',
          delay: { id: expect.any(String) },
        },
      );
    });

    test('should be a no-op when nothing has been tracked', () => {
      expect(() => heartbeat.stop()).not.toThrow();
      jest.advanceTimersByTime(5000);
      expect(trackMock).not.toHaveBeenCalled();
    });

    test('should be safe to call multiple times', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await heartbeat.track(event);

      heartbeat.stop();
      expect(() => heartbeat.stop()).not.toThrow();

      jest.clearAllMocks();
      jest.advanceTimersByTime(5000);
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
          delay: { id: expect.any(String) as string, timeout: 1000 },
        },
      );

      // flush one event via trackNoDelay and heartbeat remaining tracked events
      jest.clearAllMocks();
      await heartbeat.trackNoDelay(events[0]);
      expect(trackMock).toHaveBeenCalledTimes(3);
      expect(trackMock).toHaveBeenNthCalledWith(
        1,
        'test1',
        { test: 'test1' },
        {
          insert_id: '1',
          delay: { id: expect.any(String) },
        },
      );
      expect(trackMock).toHaveBeenNthCalledWith(
        2,
        'test2',
        { test: 'test2-updated' },
        {
          insert_id: '2',
          delay: { id: expect.any(String), timeout: 1000 },
        },
      );
      expect(trackMock).toHaveBeenNthCalledWith(
        3,
        'test3',
        { test: 'test3' },
        {
          insert_id: '3',
          delay: { id: expect.any(String), timeout: 1000 },
        },
      );
      jest.advanceTimersByTime(1000);
      expect(trackMock).toHaveBeenCalledTimes(5);
    });
  });

  describe('getHeartbeatInstance', () => {
    test('should return the same instance for the same client', () => {
      const instance1 = getHeartbeatInstance(mockClient);
      const instance2 = getHeartbeatInstance(mockClient);
      expect(instance1).toBe(instance2);
    });
  });
});
