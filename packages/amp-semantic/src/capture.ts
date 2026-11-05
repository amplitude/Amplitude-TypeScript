import { getDocumentIdentity } from './identity';
import {
  Cleanup,
  HostSignals,
  RecorderContext,
  SemanticCaptureConfig,
  SemanticEvent,
  SemanticFamily,
  SemanticHost,
  SemanticPayloads,
  SemanticRecorder,
} from './types';

export const DEFAULT_SEMANTIC_CAP = 200;

export interface SemanticCapture<P extends object = SemanticPayloads> {
  isActive: () => boolean;
  start: () => void;
  stop: () => void;
  updateConfig: (config: SemanticCaptureConfig<P>) => void;
  resetSession: () => void;
  notify: <K extends keyof HostSignals>(signal: K, value: HostSignals[K]) => void;
}

/** Composable runtime. Sampling and caps belong to a session, listeners to a recording. */
export function createCapture<P extends object = SemanticPayloads>(
  config: SemanticCaptureConfig<P>,
  host: SemanticHost<P>,
  recorders: readonly SemanticRecorder<P>[],
  caps: Partial<Record<SemanticFamily<P>, number>> = {},
): SemanticCapture<P> {
  let settings = copyConfig(config);
  let active = false;
  let requested = false;
  let sample: number | undefined;
  let cleanups: Cleanup[] = [];
  let counts: Partial<Record<SemanticFamily<P>, number>> = {};
  let dropped: Partial<Record<SemanticFamily<P>, number>> = {};
  const signals = new Map<keyof HostSignals, Set<(value: never) => void>>();
  const now = host.now ?? Date.now;
  const report = (error: unknown) => {
    try {
      host.onError?.(error);
    } catch {
      /* Diagnostics must not affect the host. */
    }
  };
  const safely = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      report(error);
    }
  };
  const enabled = (family: SemanticFamily<P>) => active && settings.families?.[family] !== false;
  const hasCapacity = (family: SemanticFamily<P>) =>
    enabled(family) && (counts[family] ?? 0) < (caps[family] ?? DEFAULT_SEMANTIC_CAP);
  const canEmit = (family: SemanticFamily<P>): boolean => {
    if (!enabled(family)) return false;
    if (hasCapacity(family)) return true;
    dropped[family] = (dropped[family] ?? 0) + 1;
    return false;
  };
  const context: Omit<RecorderContext<P>, 'onCleanup'> = {
    host,
    now,
    canEmit,
    dropped: () => ({ ...dropped }),
    clearDropped: () => {
      dropped = {};
    },
    emit: <K extends SemanticFamily<P>>(family: K, payload: P[K], timestamp = now()): boolean => {
      if (!canEmit(family)) return false;
      let identity;
      try {
        identity = host.getIdentity?.();
      } catch (error) {
        report(error);
      }
      identity ??= getDocumentIdentity(host.document, host.window);
      const event = {
        name: family,
        payload: { ...payload, v: 1, tab_id: identity.tab_id, document_id: identity.document_id },
        timestamp,
      } as SemanticEvent<P>;
      // Reserve capacity before calling a host that may emit reentrantly.
      const reservedCounts = counts;
      reservedCounts[family] = (reservedCounts[family] ?? 0) + 1;
      try {
        host.emit(event);
      } catch (error) {
        reservedCounts[family] = (reservedCounts[family] as number) - 1;
        report(error);
        return false;
      }
      return true;
    },
    on: (signal, callback) => {
      let listeners = signals.get(signal);
      if (!listeners) {
        listeners = new Set();
        signals.set(signal, listeners);
      }
      const listener = (value: never) => safely(() => callback(value));
      listeners.add(listener);
      const registered = listeners;
      return () => {
        registered.delete(listener);
      };
    },
  };
  const detach = () => {
    active = false;
    const previous = cleanups;
    cleanups = [];
    previous.reverse().forEach((cleanup) => safely(cleanup));
    signals.clear();
  };
  const attach = () => {
    if (active || !requested || !settings.enabled) return;
    const rate = settings.sampleRate ?? 1;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1) return;
    if (sample === undefined) sample = (host.random ?? Math.random)();
    if (sample >= rate) return;
    active = true;
    for (const recorder of recorders) {
      if (recorder.families.some(enabled)) {
        const acquired: Cleanup[] = [];
        const registerCleanup = (cleanup: Cleanup) => {
          if (!acquired.includes(cleanup)) acquired.push(cleanup);
        };
        const scoped: RecorderContext<P> = {
          ...context,
          onCleanup: registerCleanup,
          on: (signal, callback) => {
            const cleanup = context.on(signal, callback);
            registerCleanup(cleanup);
            return cleanup;
          },
        };
        const rollback = () => {
          acquired
            .splice(0)
            .reverse()
            .forEach((cleanup) => safely(cleanup));
        };
        const unregisterRollback = () => {
          const index = cleanups.lastIndexOf(rollback);
          if (index >= 0) cleanups.splice(index, 1);
        };
        try {
          // Register rollback before setup so reentrant stop/reset can tear listeners down.
          cleanups.push(rollback);
          registerCleanup(recorder.setup(scoped));
          if (!active) {
            unregisterRollback();
            rollback();
          }
        } catch (error) {
          unregisterRollback();
          rollback();
          report(error);
        }
      }
    }
  };
  return {
    isActive: () => active,
    start: () => {
      requested = true;
      attach();
    },
    stop: () => {
      requested = false;
      detach();
    },
    updateConfig: (next) => {
      detach();
      settings = copyConfig(next);
      attach();
    },
    resetSession: () => {
      detach();
      sample = undefined;
      counts = {};
      dropped = {};
      attach();
    },
    notify: (signal, value) => {
      if (!active) return;
      signals.get(signal)?.forEach((callback) => callback(value as never));
    },
  };
}

function copyConfig<P extends object>(config: SemanticCaptureConfig<P>): SemanticCaptureConfig<P> {
  return { ...config, families: config.families ? { ...config.families } : undefined };
}
