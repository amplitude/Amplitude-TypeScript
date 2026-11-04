import { ReactNativeConfig } from '@amplitude/analytics-core';
import { AppState } from 'react-native';
import type { InterfaceSignalState } from '@amplitude/session-replay-react-native';
import { onInterfaceChange, type InterfaceChangeSource } from '../utils/on-interface-change';
import type { AmpCaptureCoordinates } from '../amp-capture';
import { isWeb } from '../utils/platform';

const DEAD_CLICK_TIMEOUT = 3_000;

/**
 * Session Replay owns UI observation, sampling and recording availability. Read its
 * exported APIs instead of interpreting JS renders or analytics events as UI changes.
 * Observation history and lifecycle invalidation are maintained here in JavaScript.
 * Replay packages are optional peers, loaded only when native dead-click detection is enabled.
 */
export function createDeadClickTracker(
  config: ReactNativeConfig,
  onDeadClick: (properties: Record<string, any>, time: number) => void,
) {
  const observations = new Map<InterfaceChangeSource, { generation: number; lastChangeTime: number }>();
  const getObservation = (source: InterfaceChangeSource) => {
    let observation = observations.get(source);
    if (!observation) {
      observation = { generation: 0, lastChangeTime: 0 };
      observations.set(source, observation);
    }
    return observation;
  };
  const replay = isWeb()
    ? undefined
    : onInterfaceChange(
        (signal, source) => {
          const observation = getObservation(source);
          if (signal.interfaceChanged) {
            observation.lastChangeTime = Math.max(observation.lastChangeTime, signal.timestamp);
          }
          if (!signal.isProviding || signal.identityChanged) {
            observation.generation++;
          }
        },
        (error) => {
          config.loggerProvider.debug(`Could not observe Replay interface changes: ${String(error)}`);
        },
      );
  if (!replay?.hasProviders) {
    config.loggerProvider.debug('Dead click detection requires Session Replay with UI change signals.');
    replay?.remove();
    return { registerClickEvent: () => undefined, teardown: () => undefined };
  }

  let disposed = false;
  let lifecycleGeneration = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const clearPending = () => {
    lifecycleGeneration++;
    timers.forEach(clearTimeout);
    timers.clear();
  };
  const appStateSubscription = AppState.addEventListener('change', clearPending);

  const registerClickEvent = (coordinates: AmpCaptureCoordinates, eventProperties: Record<string, any>) => {
    if (disposed || config.optOut || (AppState.currentState && AppState.currentState !== 'active')) {
      return;
    }
    const time = Date.now();
    const generation = lifecycleGeneration;
    const sessionId = config.sessionId;
    const deviceId = config.deviceId;
    const isCurrent = () =>
      !disposed &&
      generation === lifecycleGeneration &&
      !config.optOut &&
      config.sessionId === sessionId &&
      config.deviceId === deviceId;
    const isProviding = (state: InterfaceSignalState | null) =>
      state?.isProviding && state.sessionId === String(sessionId) && state.deviceId === deviceId;

    // Register before the application's press handler runs. Each press has its own
    // deadline, so subsequent presses do not replace earlier candidates.
    const generations = new Map(Array.from(observations, ([source, observation]) => [source, observation.generation]));
    void replay
      .findProvider({ sessionId: String(sessionId), deviceId })
      .then((provider) => {
        if (!isCurrent()) {
          return;
        }
        if (!provider) {
          config.loggerProvider.debug(
            'Skipping dead click: no recording Session Replay provider matches the Analytics session and device. ' +
              'If this follows Fast Refresh, fully restart the development app to clear stale SDK instances.',
          );
          return;
        }
        const observation = getObservation(provider);
        const providerGeneration = generations.get(provider) ?? 0;
        if (observation.lastChangeTime >= time || observation.generation !== providerGeneration) {
          return;
        }
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!isCurrent()) {
            return;
          }
          void provider
            .getState()
            .then((state) => {
              if (
                isCurrent() &&
                isProviding(state) &&
                observation.generation === providerGeneration &&
                observation.lastChangeTime < time
              ) {
                onDeadClick(
                  {
                    ...eventProperties,
                    '[Amplitude] Begin Time': new Date(time).toISOString(),
                    '[Amplitude] End Time': new Date(time + DEAD_CLICK_TIMEOUT).toISOString(),
                    '[Amplitude] Duration': DEAD_CLICK_TIMEOUT,
                    '[Amplitude] X': Math.trunc(coordinates.x),
                    '[Amplitude] Y': Math.trunc(coordinates.y),
                    '[Amplitude] Click Count': 1,
                  },
                  time,
                );
              }
            })
            .catch(() => undefined);
        }, Math.max(0, time + DEAD_CLICK_TIMEOUT - Date.now()));
        timers.add(timer);
      })
      .catch(() => undefined);
  };

  return {
    registerClickEvent,
    clearPending,
    teardown: () => {
      disposed = true;
      clearPending();
      appStateSubscription.remove();
      replay.remove();
      observations.clear();
    },
  };
}
