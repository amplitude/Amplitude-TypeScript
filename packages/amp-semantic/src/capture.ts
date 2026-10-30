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

export const SEMANTIC_CAPS: Record<SemanticFamily, number> = { context: 200, visibility: 200 };

export interface SemanticCapture {
  isActive: () => boolean;
  start: () => void;
  stop: () => void;
  updateConfig: (config: SemanticCaptureConfig) => void;
  resetSession: () => void;
  notify: <K extends keyof HostSignals>(signal: K, value: HostSignals[K]) => void;
}

/** Composable runtime. Sampling and caps belong to a session, listeners to a recording. */
export function createCapture(
  config: SemanticCaptureConfig,
  host: SemanticHost,
  recorders: readonly SemanticRecorder[],
): SemanticCapture {
  let settings = copyConfig(config);
  let active = false;
  let requested = false;
  let snapshotSeen = false;
  let sample: number | undefined;
  let cleanups: Cleanup[] = [];
  let counts: Partial<Record<SemanticFamily, number>> = {};
  let dropped: Partial<Record<SemanticFamily, number>> = {};
  const signals = new Map<keyof HostSignals, Set<(value: never) => void>>();
  const subscribers = new Set<(event: SemanticEvent) => void>();
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
  const enabled = (family: SemanticFamily) => active && settings.families?.[family] !== false;
  const hasCapacity = (family: SemanticFamily) => enabled(family) && (counts[family] ?? 0) < SEMANTIC_CAPS[family];
  const canEmit = (family: SemanticFamily): boolean => {
    if (!enabled(family)) return false;
    if (hasCapacity(family)) return true;
    dropped[family] = (dropped[family] ?? 0) + 1;
    return false;
  };
  const context: Omit<RecorderContext, 'onCleanup'> = {
    host,
    now,
    enabled,
    canEmit,
    hasCapacity,
    dropped: () => ({ ...dropped }),
    hasSnapshot: () => snapshotSeen,
    emit: <K extends SemanticFamily>(family: K, payload: SemanticPayloads[K], timestamp = now()): boolean => {
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
      } as SemanticEvent;
      counts[family] = (counts[family] ?? 0) + 1;
      try {
        host.emit(event);
      } catch (error) {
        report(error);
        return false;
      }
      if (family === 'context') dropped = {};
      subscribers.forEach((subscriber) => safely(() => subscriber(event)));
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
    subscribe: (callback) => {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
  };
  const detach = () => {
    active = false;
    const previous = cleanups;
    cleanups = [];
    previous.reverse().forEach((cleanup) => safely(cleanup));
    signals.clear();
    subscribers.clear();
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
        const scoped: RecorderContext = {
          ...context,
          onCleanup: (cleanup) => {
            acquired.push(cleanup);
          },
          on: (signal, callback) => {
            const cleanup = context.on(signal, callback);
            acquired.push(cleanup);
            return cleanup;
          },
          subscribe: (callback) => {
            const cleanup = context.subscribe(callback);
            acquired.push(cleanup);
            return cleanup;
          },
        };
        const rollback = () => {
          acquired
            .splice(0)
            .reverse()
            .forEach((cleanup) => safely(cleanup));
        };
        try {
          acquired.push(recorder.setup(scoped));
          cleanups.push(rollback);
        } catch (error) {
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
      snapshotSeen = false;
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
      snapshotSeen = false;
      counts = {};
      dropped = {};
      attach();
    },
    notify: (signal, value) => {
      if (signal === 'snapshot') snapshotSeen = true;
      if (!active) return;
      signals.get(signal)?.forEach((callback) => callback(value as never));
    },
  };
}

function copyConfig(config: SemanticCaptureConfig): SemanticCaptureConfig {
  return { ...config, families: config.families ? { ...config.families } : undefined };
}
