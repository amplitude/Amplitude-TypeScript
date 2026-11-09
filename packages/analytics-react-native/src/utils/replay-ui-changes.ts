/** The small public Replay API needed by dead-click detection. */
interface ReplayUiChangeAPI {
  addUiChangeListener(listener: (timestamp?: number) => void): () => void;
  isRecording(): Promise<boolean>;
}

export interface ReplayUiChangeSource {
  isRecording(): Promise<boolean>;
}

// Metro compiles an unresolvable optional require to `require(undefined)`. Metro only lets try/catch
// handle that error while a module is still loading; a later require (e.g. during SDK setup) is reported
// as a fatal "requiring unknown module" error even inside try/catch. Load the optional peers once, at
// module load time, so absent packages are always handled by the catch blocks below.
const optionalReplayPackages: Partial<ReplayUiChangeAPI>[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  optionalReplayPackages.push(require('@amplitude/plugin-session-replay-react-native') as Partial<ReplayUiChangeAPI>);
} catch {
  // Either Replay package can provide UI observation independently.
}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  optionalReplayPackages.push(require('@amplitude/session-replay-react-native') as Partial<ReplayUiChangeAPI>);
} catch {
  // Analytics also works without Replay installed.
}

/** Native modules and event names remain private to the optional Replay packages. */
export function observeReplayUiChanges(
  listener: (source: ReplayUiChangeSource, timestamp: number) => void,
  onError: (error: unknown) => void,
) {
  const packages = optionalReplayPackages;

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
      const unsubscribe = replay.addUiChangeListener((timestamp) => {
        if (!removed) {
          const changedAt = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now();
          listener(source, changedAt);
        }
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
