import { createInitialExposureSnapshotScheduler } from '../../src/autocapture/schedule-initial-exposure-snapshot';
import * as constants from '../../src/constants';
import { Observable } from '@amplitude/analytics-core';
import { TimestampedEvent } from '../../src/helpers';

describe('createInitialExposureSnapshotScheduler', () => {
  let mutationObservers: Array<(value: TimestampedEvent<MutationRecord[]>) => void>;
  let mutationObservable: Observable<TimestampedEvent<MutationRecord[]>>;
  let onRescan: jest.Mock;
  let onFlush: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    mutationObservers = [];
    mutationObservable = {
      subscribe: jest.fn((cb) => {
        mutationObservers.push(cb);
        return { unsubscribe: jest.fn(), closed: false };
      }),
    } as unknown as Observable<TimestampedEvent<MutationRecord[]>>;
    onRescan = jest.fn();
    onFlush = jest.fn();
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const emitMutation = () => {
    mutationObservers.forEach((cb) => {
      cb({
        event: [{ addedNodes: [] as unknown as NodeList } as MutationRecord],
        timestamp: Date.now(),
        type: 'mutation',
      });
    });
  };

  test('should rescan and flush after the DOM is quiet', () => {
    const scheduler = createInitialExposureSnapshotScheduler({
      mutationObservable,
      onRescan,
      onFlush,
      exposureDuration: 150,
      quietMs: 750,
      maxWaitMs: 4000,
    });

    scheduler.start();
    emitMutation();

    expect(onRescan).not.toHaveBeenCalled();
    jest.advanceTimersByTime(749);
    expect(onRescan).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onRescan).toHaveBeenCalledTimes(1);
    expect(onFlush).not.toHaveBeenCalled();

    jest.advanceTimersByTime(150 + constants.EXPOSURE_SNAPSHOT_FLUSH_BUFFER_MS);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  test('should flush after max wait even if mutations never stop', () => {
    const scheduler = createInitialExposureSnapshotScheduler({
      mutationObservable,
      onRescan,
      onFlush,
      exposureDuration: 150,
      quietMs: 750,
      maxWaitMs: 4000,
    });

    scheduler.start();

    jest.advanceTimersByTime(1000);
    emitMutation();
    jest.advanceTimersByTime(1000);
    emitMutation();
    jest.advanceTimersByTime(2000);

    expect(onRescan).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(150 + constants.EXPOSURE_SNAPSHOT_FLUSH_BUFFER_MS);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  test('should reset and take a new snapshot after navigation', () => {
    const scheduler = createInitialExposureSnapshotScheduler({
      mutationObservable,
      onRescan,
      onFlush,
      exposureDuration: 150,
      quietMs: 750,
      maxWaitMs: 4000,
    });

    scheduler.start();
    jest.advanceTimersByTime(750);
    jest.advanceTimersByTime(150 + constants.EXPOSURE_SNAPSHOT_FLUSH_BUFFER_MS);
    expect(onFlush).toHaveBeenCalledTimes(1);

    onRescan.mockClear();
    onFlush.mockClear();

    scheduler.reset();
    jest.advanceTimersByTime(750);
    expect(onRescan).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(150 + constants.EXPOSURE_SNAPSHOT_FLUSH_BUFFER_MS);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  test('should stop scheduling after stop is called', () => {
    const scheduler = createInitialExposureSnapshotScheduler({
      mutationObservable,
      onRescan,
      onFlush,
      exposureDuration: 150,
    });

    scheduler.start();
    scheduler.stop();
    jest.advanceTimersByTime(5000);
    expect(onRescan).not.toHaveBeenCalled();
    expect(onFlush).not.toHaveBeenCalled();
  });
});
