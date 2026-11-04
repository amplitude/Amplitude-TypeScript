import type {
  InterfaceChangeSubscription,
  InterfaceSignal,
  InterfaceSignalState,
} from '@amplitude/session-replay-react-native';

interface ReplayInterfaceAPI {
  onInterfaceChange(listener: (signal: InterfaceSignal) => void): InterfaceChangeSubscription;
}

/** An opaque recording source; native module resolution stays inside Replay. */
export interface InterfaceChangeSource {
  getState(): Promise<InterfaceSignalState | null>;
}

/** Subscribe to either optional Replay package and find a recording source by identity. */
export function onInterfaceChange(
  listener: (signal: InterfaceSignal, source: InterfaceChangeSource) => void,
  onError: (error: unknown) => void = () => undefined,
) {
  const packages: Partial<ReplayInterfaceAPI>[] = [];
  // Literal requires inside try blocks allow Metro to omit absent optional peers.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    packages.push(require('@amplitude/plugin-session-replay-react-native') as Partial<ReplayInterfaceAPI>);
  } catch {
    // Either package can provide native UI observation independently.
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    packages.push(require('@amplitude/session-replay-react-native') as Partial<ReplayInterfaceAPI>);
  } catch {
    // Analytics remains usable without Session Replay installed.
  }

  const subscriptions: InterfaceChangeSubscription[] = [];
  const sources: InterfaceChangeSource[] = [];
  let removed = false;
  for (const replay of packages) {
    if (typeof replay.onInterfaceChange !== 'function') continue;
    let subscription: InterfaceChangeSubscription | undefined;
    const source: InterfaceChangeSource = {
      getState: () => subscription?.getState() ?? Promise.resolve(null),
    };
    try {
      subscription = replay.onInterfaceChange((signal) => {
        if (!removed) listener(signal, source);
      });
      subscriptions.push(subscription);
      sources.push(source);
    } catch (error) {
      onError(error);
    }
  }

  return {
    hasProviders: sources.length > 0,
    async findProvider(identity: { sessionId: string; deviceId: string | undefined }) {
      if (removed) return undefined;
      const candidates = await Promise.all(
        sources.map(async (source) => {
          try {
            const state = await source.getState();
            return state?.isProviding && state.sessionId === identity.sessionId && state.deviceId === identity.deviceId
              ? source
              : undefined;
          } catch (error) {
            onError(error);
            return undefined;
          }
        }),
      );
      return removed ? undefined : candidates.find((source) => source !== undefined);
    },
    remove: () => {
      if (removed) return;
      removed = true;
      subscriptions.forEach((subscription) => subscription.remove());
    },
  };
}
