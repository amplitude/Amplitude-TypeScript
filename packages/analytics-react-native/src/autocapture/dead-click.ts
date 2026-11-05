import type { ReactNativeConfig } from '@amplitude/analytics-core';
import { AppState } from 'react-native';
import type { AmpCaptureCoordinates } from '../amp-capture';
import { observeReplayUiChanges, type ReplayUiChangeSource } from '../utils/replay-ui-changes';
import { isWeb } from '../utils/platform';

const DEAD_CLICK_TIMEOUT = 3_000;

/** Each press keeps its own deadline; Replay supplies UI changes and recording availability. */
export function createDeadClickTracker(
  config: ReactNativeConfig,
  onDeadClick: (properties: Record<string, any>, time: number) => void,
) {
  const pending = new Map<ReturnType<typeof setTimeout>, { deadline: number; sources: ReplayUiChangeSource[] }>();
  let disposed = false;
  const clearPending = () => {
    pending.forEach((_, timer) => clearTimeout(timer));
    pending.clear();
  };
  const replay = isWeb()
    ? undefined
    : observeReplayUiChanges(
        (source) => {
          const now = Date.now();
          pending.forEach((click, timer) => {
            if (click.sources.includes(source) && now <= click.deadline) {
              clearTimeout(timer);
              pending.delete(timer);
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
    const sources = replay.sources.filter((source) => source.isRecording());
    if (!sources.length) return;

    const time = Date.now();
    const deadline = time + DEAD_CLICK_TIMEOUT;
    const sessionId = config.sessionId;
    const deviceId = config.deviceId;
    const timer = setTimeout(() => {
      if (!pending.delete(timer)) return;
      if (
        disposed ||
        config.optOut ||
        !isActive() ||
        config.sessionId !== sessionId ||
        config.deviceId !== deviceId ||
        !sources.some((source) => source.isRecording())
      ) {
        return;
      }
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
    }, DEAD_CLICK_TIMEOUT);
    pending.set(timer, { deadline, sources });
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
