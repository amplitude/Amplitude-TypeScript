import { getGlobalScope, ILogger } from '@amplitude/analytics-core';

/**
 * Persists the wall-clock time at which a session's replay first began capturing,
 * keyed by sessionId. The persisted value drives the `min_session_duration_ms` gate:
 * we measure elapsed *replay* time, not just current page-load time, so a session that
 * is paused and resumed (or that crosses a page navigation) is still gated correctly.
 *
 * All storage access is wrapped in try/catch — when localStorage is unavailable (Safari
 * private mode, quota exceeded, sandboxed iframe) callers fall back to `Date.now()` so
 * the gate degrades gracefully instead of throwing.
 */

const KEY_PREFIX = 'AMP_SR_START_';
const APIKEY_FINGERPRINT_LEN = 10;

/**
 * TTL beyond which a stored start time is treated as stale and pruned on next init.
 * 24 hours covers the longest realistic single-session duration in Amplitude (default
 * inactivity timeout is 30 minutes; some configs extend sessions across resumes).
 */
export const REPLAY_START_TIME_TTL_MS = 24 * 60 * 60 * 1000;

const buildKeyPrefix = (apiKey: string) => `${KEY_PREFIX}${apiKey.substring(0, APIKEY_FINGERPRINT_LEN)}_`;
const buildKey = (apiKey: string, sessionId: string | number) => `${buildKeyPrefix(apiKey)}${sessionId}`;

const getLocalStorage = (): Storage | undefined => {
  try {
    const scope = getGlobalScope() as { localStorage?: Storage } | undefined;
    return scope?.localStorage;
  } catch {
    // Accessing localStorage can throw in some sandboxed contexts.
    return undefined;
  }
};

/**
 * Returns the persisted replay start time for this sessionId if one exists and is fresh,
 * otherwise writes `now` and returns it. Returns undefined only if storage is unavailable
 * — callers should fall back to a transient `Date.now()` in that case.
 */
export const getOrInitReplayStartTime = (
  apiKey: string,
  sessionId: string | number,
  now: number,
  logger?: ILogger,
): number | undefined => {
  const storage = getLocalStorage();
  if (!storage) return undefined;
  const key = buildKey(apiKey, sessionId);
  try {
    const raw = storage.getItem(key);
    if (raw !== null) {
      const parsed = Number(raw);
      // Treat NaN, non-finite, future-dated, and stale entries as missing.
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= now && now - parsed < REPLAY_START_TIME_TTL_MS) {
        return parsed;
      }
    }
    storage.setItem(key, String(now));
    return now;
  } catch (e) {
    logger?.debug(`Failed to read/write replay start time from storage: ${String(e)}`);
    return undefined;
  }
};

export const setReplayStartTime = (
  apiKey: string,
  sessionId: string | number,
  startTime: number,
  logger?: ILogger,
): void => {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(buildKey(apiKey, sessionId), String(startTime));
  } catch (e) {
    logger?.debug(`Failed to write replay start time to storage: ${String(e)}`);
  }
};

export const removeReplayStartTime = (apiKey: string, sessionId: string | number, logger?: ILogger): void => {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(buildKey(apiKey, sessionId));
  } catch (e) {
    logger?.debug(`Failed to remove replay start time from storage: ${String(e)}`);
  }
};

/**
 * Drops stored start times older than {@link REPLAY_START_TIME_TTL_MS}. Cheap best-effort
 * sweep called on init — keeps localStorage from accumulating dead entries when sessions
 * end without a clean transition (browser close, crash). Scoped to this API key's keys
 * so multi-tenant pages don't churn through each other's entries.
 */
export const pruneStaleReplayStartTimes = (apiKey: string, now: number, logger?: ILogger): void => {
  const storage = getLocalStorage();
  if (!storage) return;
  const prefix = buildKeyPrefix(apiKey);
  try {
    // Collect first; localStorage indices shift as we remove.
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0 || now - parsed >= REPLAY_START_TIME_TTL_MS) {
        stale.push(key);
      }
    }
    for (const key of stale) {
      storage.removeItem(key);
    }
  } catch (e) {
    logger?.debug(`Failed to prune stale replay start times: ${String(e)}`);
  }
};
