import { ReactNativeConfig } from '@amplitude/analytics-core';
import { AppState, NativeEventEmitter, TurboModuleRegistry, TurboModule } from 'react-native';
import type { AmpCaptureCoordinates } from '../amp-capture';
import { isWeb } from '../utils/platform';

const DEAD_CLICK_TIMEOUT = 3_000;

interface InterfaceSignalState {
  isProviding: boolean;
  sessionId: string;
  deviceId: string | null;
}

interface SessionReplaySignalModule extends TurboModule {
  getInterfaceSignalState(): Promise<InterfaceSignalState>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

interface InterfaceSignal {
  type: 'interfaceChanged' | 'stateChanged';
  timestamp: number;
}

/**
 * Session Replay owns UI observation, sampling and recording availability. Read its
 * native events instead of interpreting JS renders or analytics events as UI changes.
 * Observation history and lifecycle invalidation are maintained here in JavaScript.
 * The module is resolved lazily so Replay remains optional for other autocapture features.
 */
export function createDeadClickTracker(
  config: ReactNativeConfig,
  onDeadClick: (properties: Record<string, any>, time: number) => void,
) {
  const providers = isWeb()
    ? []
    : ['PluginSessionReplayReactNative', 'AMPNativeSessionReplay'].flatMap((name) => {
        const replay = TurboModuleRegistry.get<SessionReplaySignalModule>(name);
        if (
          typeof replay?.getInterfaceSignalState !== 'function' ||
          typeof replay.addListener !== 'function' ||
          typeof replay.removeListeners !== 'function'
        ) {
          return [];
        }
        const observation = { generation: 0, lastChangeTime: 0 };
        const subscription = new NativeEventEmitter(replay).addListener(
          `${name}InterfaceSignal`,
          (signal: InterfaceSignal) => {
            if (signal.type === 'interfaceChanged') {
              observation.lastChangeTime = Math.max(observation.lastChangeTime, signal.timestamp);
            } else if (signal.type === 'stateChanged') {
              observation.generation++;
            }
          },
        );
        return [{ replay, observation, subscription }];
      });
  if (providers.length === 0) {
    config.loggerProvider.debug('Dead click detection requires Session Replay with UI change signals.');
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
    const isProviding = (state: InterfaceSignalState) =>
      state.isProviding && state.sessionId === String(sessionId) && state.deviceId === deviceId;

    // Register before the application's press handler runs. Each press has its own
    // deadline, so subsequent presses do not replace earlier candidates.
    void Promise.all(
      providers.map(async (provider) => {
        const generation = provider.observation.generation;
        try {
          return { ...provider, generation, state: await provider.replay.getInterfaceSignalState() };
        } catch (error) {
          config.loggerProvider.debug(`Could not read Session Replay UI-change signals: ${String(error)}`);
          return undefined;
        }
      }),
    )
      .then((states) => {
        // Both packages can be linked even when only one is initialized. Use a
        // recording provider with matching identity, and emit at most once per press.
        const provider = states.find((entry) => entry && isProviding(entry.state));
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
        if (provider.observation.lastChangeTime >= time || provider.observation.generation !== provider.generation) {
          return;
        }
        const { replay, observation, generation } = provider;
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!isCurrent()) {
            return;
          }
          void replay
            .getInterfaceSignalState()
            .then((state) => {
              if (
                isCurrent() &&
                isProviding(state) &&
                observation.generation === generation &&
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
      providers.forEach(({ subscription }) => subscription.remove());
    },
  };
}
