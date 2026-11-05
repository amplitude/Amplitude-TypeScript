/** The small public Replay API needed by dead-click detection. */
interface ReplayUiChangeAPI {
  addUiChangeListener(listener: () => void): () => void;
  isRecording(): Promise<boolean>;
}

export interface ReplayUiChangeSource {
  isRecording(): Promise<boolean>;
}

/** Native modules and event names remain private to the optional Replay packages. */
export function observeReplayUiChanges(
  listener: (source: ReplayUiChangeSource) => void,
  onError: (error: unknown) => void,
) {
  const packages: Partial<ReplayUiChangeAPI>[] = [];
  // Metro can omit absent optional peers when these literal requires are in try blocks.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    packages.push(require('@amplitude/plugin-session-replay-react-native') as Partial<ReplayUiChangeAPI>);
  } catch {
    // Either Replay package can provide UI observation independently.
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    packages.push(require('@amplitude/session-replay-react-native') as Partial<ReplayUiChangeAPI>);
  } catch {
    // Analytics also works without Replay installed.
  }

  const sources: ReplayUiChangeSource[] = [];
  const unsubscribes: (() => void)[] = [];
  let removed = false;
  for (const replay of packages) {
    if (typeof replay.addUiChangeListener !== 'function' || typeof replay.isRecording !== 'function') continue;
    const source: ReplayUiChangeSource = {
      isRecording: async () => {
        if (removed) return false;
        try {
          const recording = await replay.isRecording?.();
          return !removed && recording === true;
        } catch (error) {
          onError(error);
          return false;
        }
      },
    };
    try {
      const unsubscribe = replay.addUiChangeListener(() => {
        if (!removed) listener(source);
      });
      if (typeof unsubscribe !== 'function') continue;
      sources.push(source);
      unsubscribes.push(unsubscribe);
    } catch (error) {
      onError(error);
    }
  }

  return {
    sources,
    remove: () => {
      if (removed) return;
      removed = true;
      for (const unsubscribe of unsubscribes) {
        try {
          unsubscribe();
        } catch (error) {
          onError(error);
        }
      }
    },
  };
}
