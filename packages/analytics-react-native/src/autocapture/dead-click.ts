import { ReactNativeConfig } from '@amplitude/analytics-core';
import { AppState } from 'react-native';
import type { InterfaceSignal } from '@amplitude/session-replay-react-native';
import type { AmpCaptureCoordinates } from '../amp-capture';
import { isWeb } from '../utils/platform';

const DEAD_CLICK_TIMEOUT = 3_000;

interface InterfaceSignalProvider {
  addInterfaceSignalListener(listener: (signal: InterfaceSignal) => void): { remove(): void };
}

function getInterfaceSignalProviders(): InterfaceSignalProvider[] {
  const providers: Partial<InterfaceSignalProvider>[] = [];
  // Literal requires inside try blocks let Metro treat absent Replay peers as
  // optional when transformer.allowOptionalDependencies is enabled.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    providers.push(require('@amplitude/plugin-session-replay-react-native') as Partial<InterfaceSignalProvider>);
  } catch {
    // Replay is optional; Analytics remains usable without the package.
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    providers.push(require('@amplitude/session-replay-react-native') as Partial<InterfaceSignalProvider>);
  } catch {
    // Either Replay package can provide interface signals independently.
  }
  return providers.filter(
    (provider): provider is InterfaceSignalProvider => typeof provider.addInterfaceSignalListener === 'function',
  );
}

/**
 * Session Replay owns UI observation, sampling and recording availability. Subscribe to its
 * exported snapshots instead of interpreting JS renders or analytics events as UI changes.
 * Observation history and lifecycle invalidation are maintained here in JavaScript.
 * Replay packages are optional peers, loaded only when native dead-click detection is enabled.
 */
export function createDeadClickTracker(
  config: ReactNativeConfig,
  onDeadClick: (properties: Record<string, any>, time: number) => void,
) {
  const providers = isWeb()
    ? []
    : getInterfaceSignalProviders().flatMap((replay) => {
        const observation = { generation: 0, lastChangeTime: 0, state: null as InterfaceSignal | null };
        try {
          const subscription = replay.addInterfaceSignalListener((signal) => {
            if (signal.interfaceChanged) {
              observation.lastChangeTime = Math.max(observation.lastChangeTime, signal.timestamp);
            }
            const previous = observation.state;
            if (
              !signal.isProviding ||
              signal.identityChanged ||
              (previous && (previous.sessionId !== signal.sessionId || previous.deviceId !== signal.deviceId))
            ) {
              observation.generation++;
            }
            observation.state = signal;
          });
          return [{ replay, observation, subscription }];
        } catch (error) {
          config.loggerProvider.debug(`Could not subscribe to Replay UI-change signals: ${String(error)}`);
          return [];
        }
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
    const isProviding = (state: InterfaceSignal | null) =>
      state?.isProviding && state.sessionId === String(sessionId) && state.deviceId === deviceId;

    // Wait for an initial Replay snapshot before accepting presses. Each report
    // carries complete state, so presses and deadlines never query native modules.
    const provider = providers.find(({ observation }) => isProviding(observation.state));
    if (!provider) {
      config.loggerProvider.debug('Skipping dead click: no Replay snapshot matches the Analytics session and device.');
      return;
    }
    const { observation } = provider;
    if (observation.lastChangeTime >= time) return;
    const providerGeneration = observation.generation;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (
        isCurrent() &&
        isProviding(observation.state) &&
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
    }, DEAD_CLICK_TIMEOUT);
    timers.add(timer);
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
