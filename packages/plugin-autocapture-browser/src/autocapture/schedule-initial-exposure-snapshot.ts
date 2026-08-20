import { Observable, Unsubscribable } from '@amplitude/analytics-core';
import { TimestampedEvent } from '../helpers';
import * as constants from '../constants';

export interface InitialExposureSnapshotScheduler {
  start: () => void;
  reset: () => void;
  stop: () => void;
}

export function createInitialExposureSnapshotScheduler({
  mutationObservable,
  onRescan,
  onFlush,
  exposureDuration,
  quietMs = constants.EXPOSURE_SNAPSHOT_QUIET_MS,
  maxWaitMs = constants.EXPOSURE_SNAPSHOT_MAX_WAIT_MS,
}: {
  mutationObservable: Observable<TimestampedEvent<MutationRecord[]>>;
  onRescan: () => void;
  onFlush: () => void;
  exposureDuration: number;
  quietMs?: number;
  maxWaitMs?: number;
}): InitialExposureSnapshotScheduler {
  let snapshotTaken = false;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  let exposureWaitTimer: ReturnType<typeof setTimeout> | undefined;
  let mutationSubscription: Unsubscribable | undefined;
  let domContentLoadedListener: (() => void) | undefined;

  const clearTimers = () => {
    if (quietTimer) {
      clearTimeout(quietTimer);
      quietTimer = undefined;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = undefined;
    }
    if (exposureWaitTimer) {
      clearTimeout(exposureWaitTimer);
      exposureWaitTimer = undefined;
    }
  };

  const removeDomContentLoadedListener = () => {
    if (domContentLoadedListener) {
      document.removeEventListener('DOMContentLoaded', domContentLoadedListener);
      domContentLoadedListener = undefined;
    }
  };

  const canSnapshot = (): boolean => {
    return typeof document !== 'undefined' && document.readyState !== 'loading';
  };

  const takeSnapshot = () => {
    if (snapshotTaken) {
      return;
    }

    if (!canSnapshot()) {
      if (!domContentLoadedListener) {
        domContentLoadedListener = () => {
          domContentLoadedListener = undefined;
          takeSnapshot();
        };
        document.addEventListener('DOMContentLoaded', domContentLoadedListener);
      }
      return;
    }

    snapshotTaken = true;
    clearTimers();
    removeDomContentLoadedListener();

    onRescan();

    exposureWaitTimer = setTimeout(() => {
      exposureWaitTimer = undefined;
      onFlush();
    }, exposureDuration + constants.EXPOSURE_SNAPSHOT_FLUSH_BUFFER_MS);
  };

  const scheduleQuietTimer = () => {
    if (snapshotTaken) {
      return;
    }

    if (quietTimer) {
      clearTimeout(quietTimer);
    }

    quietTimer = setTimeout(takeSnapshot, quietMs);
  };

  const arm = () => {
    clearTimers();
    removeDomContentLoadedListener();
    snapshotTaken = false;
    scheduleQuietTimer();
    maxWaitTimer = setTimeout(takeSnapshot, maxWaitMs);
  };

  return {
    start: () => {
      if (mutationSubscription) {
        return;
      }

      mutationSubscription = mutationObservable.subscribe(() => {
        scheduleQuietTimer();
      });

      arm();
    },
    reset: () => {
      arm();
    },
    stop: () => {
      mutationSubscription?.unsubscribe();
      mutationSubscription = undefined;
      clearTimers();
      removeDomContentLoadedListener();
    },
  };
}
