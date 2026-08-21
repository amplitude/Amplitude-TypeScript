import { createInitialExposureSnapshotScheduler } from '../../src/autocapture/schedule-initial-exposure-snapshot';
import * as constants from '../../src/constants';
import { Observable } from '@amplitude/analytics-core';
import { TimestampedEvent } from '../../src/helpers';

describe('createInitialExposureSnapshotScheduler', () => {
  let mutationObservers: Array<(value: TimestampedEvent<MutationRecord[]>) => void>;
  let mutationObservable: Observable<TimestampedEvent<MutationRecord[]>>;
  let subscribe: jest.Mock;
  let onRescan: jest.Mock;
  let onFlush: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    mutationObservers = [];
    subscribe = jest.fn((cb) => {
      mutationObservers.push(cb);
      return { unsubscribe: jest.fn(), closed: false };
    });
    mutationObservable = {
      subscribe,
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
      quietMs: constants.EXPOSURE_SNAPSHOT_QUIET_MS,
      maxWaitMs: 4000,
    });

    scheduler.start();
    emitMutation();

    expect(onRescan).not.toHaveBeenCalled();
    jest.advanceTimersByTime(constants.EXPOSURE_SNAPSHOT_QUIET_MS - 1);
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
      quietMs: constants.EXPOSURE_SNAPSHOT_QUIET_MS,
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
      quietMs: constants.EXPOSURE_SNAPSHOT_QUIET_MS,
      maxWaitMs: 4000,
    });

    scheduler.start();
    jest.advanceTimersByTime(constants.EXPOSURE_SNAPSHOT_QUIET_MS);
    jest.advanceTimersByTime(150 + constants.EXPOSURE_SNAPSHOT_FLUSH_BUFFER_MS);
    expect(onFlush).toHaveBeenCalledTimes(1);

    onRescan.mockClear();
    onFlush.mockClear();

    scheduler.reset();
    jest.advanceTimersByTime(constants.EXPOSURE_SNAPSHOT_QUIET_MS);
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

  test('should ignore a second start call', () => {
    const scheduler = createInitialExposureSnapshotScheduler({
      mutationObservable,
      onRescan,
      onFlush,
      exposureDuration: 150,
    });

    scheduler.start();
    scheduler.start();

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  test('should wait for DOMContentLoaded when the document is still loading', () => {
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    const addSpy = jest.spyOn(document, 'addEventListener');

    const scheduler = createInitialExposureSnapshotScheduler({
      mutationObservable,
      onRescan,
      onFlush,
      exposureDuration: 150,
      quietMs: constants.EXPOSURE_SNAPSHOT_QUIET_MS,
      maxWaitMs: 4000,
    });

    scheduler.start();
    jest.advanceTimersByTime(constants.EXPOSURE_SNAPSHOT_QUIET_MS);
    expect(onRescan).not.toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));

    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(onRescan).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(150 + constants.EXPOSURE_SNAPSHOT_FLUSH_BUFFER_MS);
    expect(onFlush).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
  });

  test('should not snapshot twice if DOMContentLoaded fires after a snapshot', () => {
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });

    const scheduler = createInitialExposureSnapshotScheduler({
      mutationObservable,
      onRescan,
      onFlush,
      exposureDuration: 150,
      quietMs: constants.EXPOSURE_SNAPSHOT_QUIET_MS,
      maxWaitMs: 4000,
    });

    scheduler.start();
    jest.advanceTimersByTime(constants.EXPOSURE_SNAPSHOT_QUIET_MS);

    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    jest.advanceTimersByTime(4000);
    expect(onRescan).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(onRescan).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  test('should remove the DOMContentLoaded listener on stop', () => {
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    const scheduler = createInitialExposureSnapshotScheduler({
      mutationObservable,
      onRescan,
      onFlush,
      exposureDuration: 150,
    });

    scheduler.start();
    jest.advanceTimersByTime(constants.EXPOSURE_SNAPSHOT_QUIET_MS);
    scheduler.stop();

    expect(removeSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));
    removeSpy.mockRestore();
  });
});
