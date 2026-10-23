import { ReactNativeConfig } from '@amplitude/analytics-core';
import { AppState, TurboModuleRegistry, TurboModule } from 'react-native';
import type { AmpCaptureCoordinates } from '../amp-capture';
import { isWeb } from '../utils/platform';

const DEAD_CLICK_TIMEOUT = 3_000;

interface InterfaceSignalState {
  isProviding: boolean;
  lastChangeTime: number;
  generation: number;
  sessionId: string;
  deviceId: string | null;
}

interface SessionReplaySignalModule extends TurboModule {
  getInterfaceSignalState(): Promise<InterfaceSignalState>;
}

/**
 * Session Replay owns UI observation, sampling and recording availability. Read its
 * native signal state instead of interpreting JS renders or analytics events as UI changes.
 * The module is resolved lazily so Replay remains optional for other autocapture features.
 */
export function createDeadClickTracker(
  config: ReactNativeConfig,
  onDeadClick: (properties: Record<string, any>, time: number) => void,
) {
  const providers = isWeb()
    ? []
    : [
        TurboModuleRegistry.get<SessionReplaySignalModule>('PluginSessionReplayReactNative'),
        TurboModuleRegistry.get<SessionReplaySignalModule>('AMPNativeSessionReplay'),
      ].filter(
        (provider): provider is SessionReplaySignalModule => typeof provider?.getInterfaceSignalState === 'function',
      );
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
      providers.map(async (replay) => {
        try {
          return { replay, state: await replay.getInterfaceSignalState() };
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
        if (provider.state.lastChangeTime >= time) {
          return;
        }
        const { replay, state: initialState } = provider;
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
                state.generation === initialState.generation &&
                state.lastChangeTime < time
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
    },
  };
}
