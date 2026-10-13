import { Heartbeat } from '../src/heartbeat';
import { getHeartbeatInstance } from '../src/';
import { CoreClient } from '../src/types/client/core-client';
import * as globalScope from '../src/global-scope';

describe('heartbeat', () => {
  let mockClient: CoreClient;
  let trackMock: jest.Mock;
  let flushMock: jest.Mock;
  let heartbeat: Heartbeat;

  const mockLoggerProvider = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    trackMock = jest.fn().mockImplementation((eventType, eventProperties, options) => ({
      promise: Promise.resolve({
        event: {
          event_type: eventType,
          event_properties: eventProperties,
          ...options,
          delay: undefined,
        },
        code: 200,
        message: 'success',
      }),
    }));
    flushMock = jest.fn();
    mockClient = {
      track: trackMock,
      flush: flushMock,
    } as unknown as CoreClient;
    heartbeat = new Heartbeat(mockClient, 1000, 1000, mockLoggerProvider);
  });

  afterEach(() => {
    heartbeat.stop();
    jest.useRealTimers();
  });

  /** Flush resetHeartbeat's setTimeout(0) macrotask before awaiting track(). */
  async function trackWithTimers(...args: Parameters<Heartbeat['track']>) {
    const promise = heartbeat.track(...args);
    await jest.advanceTimersByTimeAsync(0);
    return promise;
  }

  /** Flush resetHeartbeat's setTimeout(0) macrotask before awaiting trackNoDelay(). */
  async function trackNoDelayWithTimers(...args: Parameters<Heartbeat['trackNoDelay']>) {
    const promise = heartbeat.trackNoDelay(...args);
    await jest.advanceTimersByTimeAsync(0);
    return promise;
  }

  describe('track, update and trackNoDelay', () => {
    test('should track an event', async () => {
      const event = {
        insert_id: '12345',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await trackWithTimers(event);
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
      await trackWithTimers(event);
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
      await trackWithTimers(event);
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
      const trackResult = { event: { insert_id: 'abc' }, code: 200 };
      trackMock.mockReturnValue({ promise: Promise.resolve(trackResult) });
      const result = await trackWithTimers(event);
      expect(result).toEqual(trackResult);
    });

    test('should track an event without delay via trackNoDelay', async () => {
      const event = {
        insert_id: '12345',
        event_type: 'instant',
        event_properties: { test: 'test' },
      };
      await trackNoDelayWithTimers(event);
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
      await trackNoDelayWithTimers(event);
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
        promise: Promise.resolve({ event: { insert_id: '1' } }),
      });
      const result = await trackNoDelayWithTimers({
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      });
      expect(result).toEqual({ event: { insert_id: '1' } });
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
      await trackWithTimers(event);
      jest.clearAllMocks();

      await trackNoDelayWithTimers(event);
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

    test('should reject tracking event if it exceeds the event size limit', async () => {
      const largeValue = 'x'.repeat(4 * 10_000 + 1);
      const event = {
        insert_id: '12345',
        event_type: 'test',
        event_properties: { data: largeValue },
      };
      const result = await heartbeat.track(event);
      expect(result).toBeUndefined();
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(trackMock).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1000);
      expect(trackMock).not.toHaveBeenCalled();
    });

    test('should reject updating event if it exceeds the event size limit', async () => {
      const event = {
        insert_id: '12345',
        event_type: 'test',
        event_properties: { test: 'small' },
      };
      await trackWithTimers(event);
      jest.clearAllMocks();

      const largeValue = 'x'.repeat(4 * 10_000 + 1);
      await heartbeat.update({
        ...event,
        event_properties: { data: largeValue },
      });
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1000);
      expect(trackMock).toHaveBeenCalledWith(
        event.event_type,
        { test: 'small' },
        {
          insert_id: '12345',
          delay: { id: expect.any(String), timeout: 1000 },
        },
      );
    });
  });

  describe('heartbeat', () => {
    test('should call client.flush after tracking events when flushClient is true', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await trackWithTimers(event);
      jest.clearAllMocks();

      const callOrder: string[] = [];
      trackMock.mockImplementation(() => {
        callOrder.push('track');
        return { promise: Promise.resolve({ event: { insert_id: '1' }, code: 200, message: 'success' }) };
      });
      flushMock.mockImplementation(() => callOrder.push('flush'));

      const result = await heartbeat.heartbeat(true);

      expect(trackMock).toHaveBeenCalledTimes(1);
      expect(flushMock).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['track', 'flush']);
      expect(result).toEqual([{ event: { insert_id: '1' }, code: 200, message: 'success' }]);
    });

    test('should not call client.flush when flushClient is omitted', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await trackWithTimers(event);
      jest.clearAllMocks();

      await heartbeat.heartbeat();

      expect(trackMock).toHaveBeenCalledTimes(1);
      expect(flushMock).not.toHaveBeenCalled();
    });

    test('should not call client.flush when there are no events to track', async () => {
      const result = await heartbeat.heartbeat(true);

      expect(result).toEqual([]);
      expect(trackMock).not.toHaveBeenCalled();
      expect(flushMock).not.toHaveBeenCalled();
    });
  });

  describe('page lifecycle', () => {
    let originalAddEventListener: typeof globalThis.addEventListener | undefined;
    let originalRemoveEventListener: typeof globalThis.removeEventListener | undefined;
    let originalDispatchEvent: typeof globalThis.dispatchEvent | undefined;
    let originalDocument: typeof globalThis.document | undefined;
    let mockDocument: Document;

    beforeEach(() => {
      const mockWindowEvents = new EventTarget();
      const mockDocumentEvents = new EventTarget();

      originalAddEventListener = globalThis.addEventListener;
      originalRemoveEventListener = globalThis.removeEventListener;
      originalDispatchEvent = globalThis.dispatchEvent;
      originalDocument = globalThis.document;

      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: mockWindowEvents.addEventListener.bind(mockWindowEvents),
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: mockWindowEvents.removeEventListener.bind(mockWindowEvents),
      });
      Object.defineProperty(globalThis, 'dispatchEvent', {
        configurable: true,
        value: mockWindowEvents.dispatchEvent.bind(mockWindowEvents),
      });

      mockDocument = {
        addEventListener: mockDocumentEvents.addEventListener.bind(mockDocumentEvents),
        removeEventListener: mockDocumentEvents.removeEventListener.bind(mockDocumentEvents),
        dispatchEvent: mockDocumentEvents.dispatchEvent.bind(mockDocumentEvents),
        visibilityState: 'visible',
      } as unknown as Document;
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: mockDocument,
      });

      heartbeat.stop();
      heartbeat = new Heartbeat(mockClient, 1000, 1000, mockLoggerProvider);
    });

    afterEach(() => {
      heartbeat.stop();
      Object.defineProperty(globalThis, 'addEventListener', {
        configurable: true,
        value: originalAddEventListener,
      });
      Object.defineProperty(globalThis, 'removeEventListener', {
        configurable: true,
        value: originalRemoveEventListener,
      });
      Object.defineProperty(globalThis, 'dispatchEvent', {
        configurable: true,
        value: originalDispatchEvent,
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
    });

    function dispatchPageHide(persisted: boolean) {
      const event = new Event('pagehide');
      Object.defineProperty(event, 'persisted', { value: persisted });
      globalThis.dispatchEvent(event);
    }

    function setVisibilityState(visibilityState: DocumentVisibilityState) {
      Object.defineProperty(mockDocument, 'visibilityState', {
        configurable: true,
        value: visibilityState,
      });
    }

    async function flushLifecyclePromises() {
      await Promise.resolve();
      await Promise.resolve();
    }

    test('should heartbeat and flush the client on pagehide when the page is not persisted', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await trackWithTimers(event);
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushLifecyclePromises();

      expect(trackMock).toHaveBeenCalledWith(event.event_type, event.event_properties, {
        insert_id: '1',
        delay: { id: expect.any(String), timeout: 1000 },
      });
      expect(flushMock).toHaveBeenCalledTimes(1);
    });

    test('should run pagehide preparers before snapshotting queued events', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { stop_reason: 'timeout' },
      };
      await trackWithTimers(event);
      const remove = heartbeat.beforePageHide(() => {
        void heartbeat.update({
          insert_id: '1',
          event_type: 'test',
          event_properties: { stop_reason: 'ended' },
        });
      });
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushLifecyclePromises();

      expect(trackMock).toHaveBeenCalledWith(
        'test',
        { stop_reason: 'ended' },
        expect.objectContaining({ insert_id: '1' }),
      );

      remove();
      remove();
    });

    test('should not heartbeat or flush the client on pagehide when the page is persisted', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await trackWithTimers(event);
      jest.clearAllMocks();

      dispatchPageHide(true);
      await flushLifecyclePromises();

      expect(trackMock).not.toHaveBeenCalled();
      expect(flushMock).not.toHaveBeenCalled();
    });

    test('should reset the heartbeat when the tab becomes hidden', async () => {
      await trackWithTimers({
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      });
      const resetHeartbeatMock = jest.spyOn(heartbeat as any, 'resetHeartbeat').mockResolvedValue([]);

      setVisibilityState('visible');
      mockDocument.dispatchEvent(new Event('visibilitychange'));
      expect(resetHeartbeatMock).not.toHaveBeenCalled();

      setVisibilityState('hidden');
      mockDocument.dispatchEvent(new Event('visibilitychange'));
      expect(resetHeartbeatMock).toHaveBeenCalledTimes(1);

      resetHeartbeatMock.mockRestore();
    });

    test('should remove page lifecycle listeners when stopped', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await trackWithTimers(event);
      heartbeat.stop();
      jest.clearAllMocks();

      dispatchPageHide(false);
      mockDocument.dispatchEvent(new Event('visibilitychange'));
      await flushLifecyclePromises();

      expect(trackMock).not.toHaveBeenCalled();
      expect(flushMock).not.toHaveBeenCalled();
    });

    test('should re-add page lifecycle listeners after tracking restarts', async () => {
      await trackWithTimers({
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      });
      heartbeat.stop();
      await trackWithTimers({
        insert_id: '2',
        event_type: 'test',
        event_properties: { test: 'test' },
      });
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushLifecyclePromises();

      expect(trackMock).toHaveBeenCalledTimes(1);
      expect(flushMock).toHaveBeenCalledTimes(1);
    });

    test('should only add page lifecycle listeners once while tracking', async () => {
      await trackWithTimers({
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      });
      await trackWithTimers({
        insert_id: '2',
        event_type: 'test',
        event_properties: { test: 'test' },
      });
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushLifecyclePromises();

      // a single pagehide listener heartbeats both events and flushes once
      expect(trackMock).toHaveBeenCalledTimes(2);
      expect(flushMock).toHaveBeenCalledTimes(1);
    });

    test('should not add page lifecycle listeners when there is no document', async () => {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: undefined,
      });
      heartbeat = new Heartbeat(mockClient, 1000, 1000, mockLoggerProvider);
      await trackWithTimers({
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      });
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushLifecyclePromises();

      expect(trackMock).not.toHaveBeenCalled();
      expect(flushMock).not.toHaveBeenCalled();
    });

    test('should not add page lifecycle listeners when there is no global scope', async () => {
      const getGlobalScopeMock = jest.spyOn(globalScope, 'getGlobalScope').mockReturnValue(undefined);
      heartbeat = new Heartbeat(mockClient, 1000, 1000, mockLoggerProvider);
      await trackWithTimers({
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      });
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushLifecyclePromises();

      expect(trackMock).not.toHaveBeenCalled();
      expect(flushMock).not.toHaveBeenCalled();
      getGlobalScopeMock.mockRestore();
    });
  });

  describe('stop', () => {
    test('should stop the interval so no further heartbeats fire', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await trackWithTimers(event);
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
      await trackWithTimers(event);

      heartbeat.stop();
      jest.clearAllMocks();
      trackMock.mockReturnValue({
        promise: Promise.resolve({ event: { insert_id: '1' } }),
      });

      const result = await trackNoDelayWithTimers(event);
      expect(result).toEqual({ event: { insert_id: '1' } });
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

    test('should call client.flush when stop is called with flush true', async () => {
      const event = {
        insert_id: '1',
        event_type: 'test',
        event_properties: { test: 'test' },
      };
      await trackWithTimers(event);

      heartbeat.stop(true);

      expect(flushMock).toHaveBeenCalledTimes(1);
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
      await trackWithTimers(event);

      heartbeat.stop();
      expect(() => heartbeat.stop()).not.toThrow();

      jest.clearAllMocks();
      jest.advanceTimersByTime(5000);
      expect(trackMock).not.toHaveBeenCalled();
    });
  });

  describe('.resetHeartbeat', () => {
    test('should only reset the heartbeat once if called multiple times', async () => {
      const heartbeatMock = jest.spyOn(heartbeat as any, 'heartbeat');
      const res1 = heartbeat.trackNoDelay({ insert_id: '1', event_type: 'test', event_properties: { test: 'test1' } });
      const res2 = heartbeat.trackNoDelay({ insert_id: '2', event_type: 'test', event_properties: { test: 'test2' } });
      await jest.advanceTimersByTimeAsync(0);
      const [response1, response2] = await Promise.all([res1, res2]);
      expect(heartbeatMock).toHaveBeenCalledTimes(1);
      expect(response1).toEqual({
        event: { insert_id: '1', event_type: 'test', event_properties: { test: 'test1' } },
        code: 200,
        message: 'success',
      });
      expect(response2).toEqual({
        event: { insert_id: '2', event_type: 'test', event_properties: { test: 'test2' } },
        code: 200,
        message: 'success',
      });
    });

    test('should trigger a new heartbeat if called while a heartbeat is in flight', async () => {
      let resolveFirst: (value: unknown) => void = () => undefined;
      trackMock.mockImplementationOnce(() => ({
        promise: new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      }));
      const heartbeatMock = jest.spyOn(heartbeat as any, 'heartbeat');

      const res1 = heartbeat.trackNoDelay({ insert_id: '1', event_type: 'test', event_properties: { test: 'test1' } });
      await jest.advanceTimersByTimeAsync(0);
      expect(heartbeatMock).toHaveBeenCalledTimes(1);

      // first heartbeat is still in flight
      const res2 = heartbeat.trackNoDelay({ insert_id: '2', event_type: 'test', event_properties: { test: 'test2' } });
      await jest.advanceTimersByTimeAsync(0);
      expect(heartbeatMock).toHaveBeenCalledTimes(2);
      expect(trackMock).toHaveBeenLastCalledWith(
        'test',
        { test: 'test2' },
        expect.objectContaining({ insert_id: '2' }),
      );
      expect(await res2).toMatchObject({ event: { insert_id: '2' } });

      resolveFirst({ event: { insert_id: '1' }, code: 200, message: 'success' });
      expect(await res1).toMatchObject({ event: { insert_id: '1' } });
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
        await trackWithTimers(event);
      }
      expect(trackMock).toHaveBeenCalledTimes(events.length * 2);
      jest.clearAllMocks();
      jest.advanceTimersByTime(1000);
      expect(trackMock).toHaveBeenCalledTimes(events.length);

      // update the properties on event 2
      events[1].event_properties.test = 'test2-updated';
      await heartbeat.update(events[1]);

      // advance to the next heartbeat
      jest.clearAllMocks();
      jest.advanceTimersByTime(1000);

      // check that the event was updated
      expect(trackMock).toHaveBeenCalledTimes(events.length);
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
      await trackNoDelayWithTimers(events[0]);
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
      const instance1 = getHeartbeatInstance(mockClient, mockLoggerProvider);
      const instance2 = getHeartbeatInstance(mockClient, mockLoggerProvider);
      expect(instance1).toBe(instance2);
    });
  });
});
