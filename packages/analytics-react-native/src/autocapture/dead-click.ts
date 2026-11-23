import type { ReactNativeConfig } from '@amplitude/analytics-core';
import { AppState } from 'react-native';
import type { AmpCaptureCoordinates } from '../amp-capture';
import { observeReplayUiChanges, type ReplayUiChangeSource } from '../utils/replay-ui-changes';
import { isWeb } from '../utils/platform';

const DEAD_CLICK_TIMEOUT = 3_000;

type PendingClick = {
  time: number;
  deadline: number;
  sources: ReplayUiChangeSource[];
  changedSources: Set<ReplayUiChangeSource>;
  ready: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

/** Each press keeps its own deadline; Replay supplies UI changes and recording availability. */
export function createDeadClickTracker(
  config: ReactNativeConfig,
  onDeadClick: (properties: Record<string, any>, time: number) => void,
) {
  const pending = new Set<PendingClick>();
  let disposed = false;
  const cancel = (click: PendingClick) => {
    if (click.timer !== undefined) clearTimeout(click.timer);
    pending.delete(click);
  };
  const clearPending = () => {
    pending.forEach(cancel);
  };
  const replay = isWeb()
    ? undefined
    : observeReplayUiChanges(
        (source, timestamp) => {
          pending.forEach((click) => {
            if (click.sources.includes(source) && timestamp >= click.time && timestamp <= click.deadline) {
              if (click.ready) cancel(click);
              else click.changedSources.add(source);
            }
          });
        },
        (error) => config.loggerProvider.debug(`Could not observe Replay UI changes: ${String(error)}`),
      );
  if (!replay?.sources.length) {
    config.loggerProvider.debug('Dead click detection requires Session Replay with UI change signals.');
    replay?.remove();
    return { registerClickEvent: () => undefined, clearPending, teardown: clearPending };
  }

  const isActive = () => !AppState.currentState || AppState.currentState === 'active';
  const appStateSubscription = AppState.addEventListener('change', clearPending);

  const registerClickEvent = (coordinates: AmpCaptureCoordinates, eventProperties: Record<string, any>) => {
    if (disposed || config.optOut || !isActive()) return;
    const time = Date.now();
    const deadline = time + DEAD_CLICK_TIMEOUT;
    const sessionId = config.sessionId;
    const deviceId = config.deviceId;
    const click: PendingClick = {
      time,
      deadline,
      sources: replay.sources,
      changedSources: new Set(),
      ready: false,
    };
    const isCurrent = () =>
      pending.has(click) &&
      !disposed &&
      !config.optOut &&
      isActive() &&
      config.sessionId === sessionId &&
      config.deviceId === deviceId;
    // Observe responses immediately, including while the initial native queries are in flight.
    pending.add(click);
    void Promise.all(replay.sources.map(async (source) => ({ source, recording: await source.isRecording() })))
      .then((states) => {
        click.sources = states.filter((state) => state.recording).map((state) => state.source);
        click.ready = true;
        if (!isCurrent() || !click.sources.length || click.sources.some((source) => click.changedSources.has(source))) {
          cancel(click);
          return;
        }
        click.timer = setTimeout(() => {
          if (!isCurrent()) {
            cancel(click);
            return;
          }
          void Promise.all(click.sources.map((source) => source.isRecording()))
            .then((recordings) => {
              const emit = isCurrent() && recordings.some(Boolean);
              cancel(click);
              if (emit) {
                onDeadClick(
                  {
                    ...eventProperties,
                    '[Amplitude] Begin Time': new Date(time).toISOString(),
                    '[Amplitude] End Time': new Date(deadline).toISOString(),
                    '[Amplitude] Duration': DEAD_CLICK_TIMEOUT,
                    '[Amplitude] X': Math.trunc(coordinates.x),
                    '[Amplitude] Y': Math.trunc(coordinates.y),
                    '[Amplitude] Click Count': 1,
                  },
                  time,
                );
              }
            })
            .catch(() => cancel(click));
        }, Math.max(0, deadline - Date.now()));
      })
      .catch(() => cancel(click));
  };

  return {
    registerClickEvent,
    clearPending,
    teardown: () => {
      if (disposed) return;
      disposed = true;
      clearPending();
      appStateSubscription.remove();
      replay.remove();
    },
  };
}
