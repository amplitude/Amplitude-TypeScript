import {
  getOrInitReplayStartTime,
  pruneStaleReplayStartTimes,
  REPLAY_START_TIME_TTL_MS,
  removeReplayStartTime,
  setReplayStartTime,
} from '../src/replay-start-time-store';

describe('replay-start-time-store', () => {
  const apiKey = 'test_api_key_12345';
  const prefix = `AMP_SR_START_${apiKey.substring(0, 10)}_`;
  const logger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
  };

  /**
   * jsdom's localStorage methods live on Storage.prototype and aren't own properties,
   * so `jest.spyOn(localStorage, 'getItem')` doesn't bind. Patching the prototype
   * directly is the reliable way to inject failure modes — callers must restore.
   */
  const overrideStorageMethod = <K extends 'getItem' | 'setItem' | 'removeItem' | 'key'>(
    name: K,
    impl: Storage[K],
  ): (() => void) => {
    const proto = Object.getPrototypeOf(globalThis.localStorage) as Storage;
    const original = proto[name];
    proto[name] = impl;
    return () => {
      proto[name] = original;
    };
  };

  beforeEach(() => {
    globalThis.localStorage.clear();
    jest.clearAllMocks();
  });

  describe('getOrInitReplayStartTime', () => {
    test('writes now when no entry exists and returns it', () => {
      const now = 1_700_000_000_000;
      const result = getOrInitReplayStartTime(apiKey, 'sess1', now, logger);
      expect(result).toBe(now);
      expect(globalThis.localStorage.getItem(`${prefix}sess1`)).toBe(String(now));
    });

    test('returns existing fresh entry without overwriting', () => {
      const earlier = 1_700_000_000_000;
      globalThis.localStorage.setItem(`${prefix}sess1`, String(earlier));
      const result = getOrInitReplayStartTime(apiKey, 'sess1', earlier + 60_000, logger);
      expect(result).toBe(earlier);
      expect(globalThis.localStorage.getItem(`${prefix}sess1`)).toBe(String(earlier));
    });

    test('treats NaN entries as missing and overwrites', () => {
      globalThis.localStorage.setItem(`${prefix}sess1`, 'NaN');
      const now = 1_700_000_000_000;
      const result = getOrInitReplayStartTime(apiKey, 'sess1', now, logger);
      expect(result).toBe(now);
    });

    test('treats non-finite entries as missing and overwrites', () => {
      globalThis.localStorage.setItem(`${prefix}sess1`, 'Infinity');
      const now = 1_700_000_000_000;
      const result = getOrInitReplayStartTime(apiKey, 'sess1', now, logger);
      expect(result).toBe(now);
    });

    test('treats future-dated entries as missing and overwrites', () => {
      const now = 1_700_000_000_000;
      globalThis.localStorage.setItem(`${prefix}sess1`, String(now + 60_000));
      const result = getOrInitReplayStartTime(apiKey, 'sess1', now, logger);
      expect(result).toBe(now);
    });

    test('treats zero/negative entries as missing and overwrites', () => {
      globalThis.localStorage.setItem(`${prefix}sess1`, '0');
      const now = 1_700_000_000_000;
      const result = getOrInitReplayStartTime(apiKey, 'sess1', now, logger);
      expect(result).toBe(now);
    });

    test('treats stale entries as missing and overwrites', () => {
      const stale = 1_000_000_000_000;
      globalThis.localStorage.setItem(`${prefix}sess1`, String(stale));
      const result = getOrInitReplayStartTime(apiKey, 'sess1', stale + REPLAY_START_TIME_TTL_MS + 1, logger);
      expect(result).toBe(stale + REPLAY_START_TIME_TTL_MS + 1);
    });

    test('returns undefined and logs when storage throws', () => {
      const restore = overrideStorageMethod('getItem', () => {
        throw new Error('boom');
      });
      try {
        const result = getOrInitReplayStartTime(apiKey, 'sess1', 1_700_000_000_000, logger);
        expect(result).toBeUndefined();
        expect(logger.debug).toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    test('returns undefined when globalThis.localStorage is unavailable', () => {
      const orig = globalThis.localStorage;
      Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
      try {
        const result = getOrInitReplayStartTime(apiKey, 'sess1', 1_700_000_000_000, logger);
        expect(result).toBeUndefined();
      } finally {
        Object.defineProperty(globalThis, 'localStorage', { value: orig, configurable: true });
      }
    });

    test('returns undefined when accessing globalThis.localStorage throws', () => {
      const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
        configurable: true,
      });
      try {
        const result = getOrInitReplayStartTime(apiKey, 'sess1', 1_700_000_000_000, logger);
        expect(result).toBeUndefined();
      } finally {
        if (orig) Object.defineProperty(globalThis, 'localStorage', orig);
      }
    });

    test('works without logger', () => {
      const restore = overrideStorageMethod('getItem', () => {
        throw new Error('boom');
      });
      try {
        const result = getOrInitReplayStartTime(apiKey, 'sess1', 1_700_000_000_000);
        expect(result).toBeUndefined();
      } finally {
        restore();
      }
    });
  });

  describe('setReplayStartTime', () => {
    test('writes the start time to storage', () => {
      setReplayStartTime(apiKey, 'sess1', 1_700_000_000_000, logger);
      expect(globalThis.localStorage.getItem(`${prefix}sess1`)).toBe('1700000000000');
    });

    test('swallows and logs storage errors', () => {
      const restore = overrideStorageMethod('setItem', () => {
        throw new Error('quota');
      });
      try {
        expect(() => setReplayStartTime(apiKey, 'sess1', 1_700_000_000_000, logger)).not.toThrow();
        expect(logger.debug).toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    test('no-op when storage is unavailable', () => {
      const orig = globalThis.localStorage;
      Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
      try {
        expect(() => setReplayStartTime(apiKey, 'sess1', 1_700_000_000_000, logger)).not.toThrow();
      } finally {
        Object.defineProperty(globalThis, 'localStorage', { value: orig, configurable: true });
      }
    });

    test('swallows storage errors without a logger', () => {
      const restore = overrideStorageMethod('setItem', () => {
        throw new Error('quota');
      });
      try {
        expect(() => setReplayStartTime(apiKey, 'sess1', 1_700_000_000_000)).not.toThrow();
      } finally {
        restore();
      }
    });
  });

  describe('removeReplayStartTime', () => {
    test('removes the entry', () => {
      globalThis.localStorage.setItem(`${prefix}sess1`, '12345');
      removeReplayStartTime(apiKey, 'sess1', logger);
      expect(globalThis.localStorage.getItem(`${prefix}sess1`)).toBeNull();
    });

    test('swallows and logs storage errors', () => {
      const restore = overrideStorageMethod('removeItem', () => {
        throw new Error('blocked');
      });
      try {
        expect(() => removeReplayStartTime(apiKey, 'sess1', logger)).not.toThrow();
        expect(logger.debug).toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    test('swallows storage errors without a logger', () => {
      const restore = overrideStorageMethod('removeItem', () => {
        throw new Error('blocked');
      });
      try {
        expect(() => removeReplayStartTime(apiKey, 'sess1')).not.toThrow();
      } finally {
        restore();
      }
    });

    test('no-op when storage is unavailable', () => {
      const orig = globalThis.localStorage;
      Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
      try {
        expect(() => removeReplayStartTime(apiKey, 'sess1', logger)).not.toThrow();
      } finally {
        Object.defineProperty(globalThis, 'localStorage', { value: orig, configurable: true });
      }
    });
  });

  describe('pruneStaleReplayStartTimes', () => {
    test('removes entries older than TTL but keeps fresh ones', () => {
      const now = 1_700_000_000_000;
      const fresh = now - 1_000;
      const stale = now - REPLAY_START_TIME_TTL_MS - 1;
      globalThis.localStorage.setItem(`${prefix}fresh`, String(fresh));
      globalThis.localStorage.setItem(`${prefix}stale`, String(stale));
      // An entry from a different api key should not be touched.
      globalThis.localStorage.setItem(`AMP_SR_START_other_apik_stale`, String(stale));

      pruneStaleReplayStartTimes(apiKey, now, logger);

      expect(globalThis.localStorage.getItem(`${prefix}fresh`)).toBe(String(fresh));
      expect(globalThis.localStorage.getItem(`${prefix}stale`)).toBeNull();
      expect(globalThis.localStorage.getItem(`AMP_SR_START_other_apik_stale`)).toBe(String(stale));
    });

    test('removes entries with non-finite or non-positive values', () => {
      globalThis.localStorage.setItem(`${prefix}bad1`, 'not-a-number');
      globalThis.localStorage.setItem(`${prefix}bad2`, '-1');
      pruneStaleReplayStartTimes(apiKey, 1_700_000_000_000, logger);
      expect(globalThis.localStorage.getItem(`${prefix}bad1`)).toBeNull();
      expect(globalThis.localStorage.getItem(`${prefix}bad2`)).toBeNull();
    });

    test('ignores keys that do not match the prefix', () => {
      globalThis.localStorage.setItem('OTHER_KEY', 'whatever');
      pruneStaleReplayStartTimes(apiKey, 1_700_000_000_000, logger);
      expect(globalThis.localStorage.getItem('OTHER_KEY')).toBe('whatever');
    });

    test('skips iteration entries where key() returns null', () => {
      globalThis.localStorage.setItem(`${prefix}sess1`, String(Date.now()));
      const proto = Object.getPrototypeOf(globalThis.localStorage) as Storage;
      const origKey = proto.key.bind(proto);
      let calls = 0;
      const restore = overrideStorageMethod('key', (idx: number) => {
        calls++;
        if (calls === 1) return null;
        return origKey(idx);
      });
      try {
        expect(() => pruneStaleReplayStartTimes(apiKey, Date.now(), logger)).not.toThrow();
      } finally {
        restore();
      }
    });

    test('skips entries where getItem returns null mid-iteration', () => {
      globalThis.localStorage.setItem(`${prefix}sess1`, String(Date.now()));
      const proto = Object.getPrototypeOf(globalThis.localStorage) as Storage;
      const origGet = proto.getItem.bind(proto);
      let callCount = 0;
      const restore = overrideStorageMethod('getItem', (k: string) => {
        callCount++;
        if (callCount === 1) return null;
        return origGet(k);
      });
      try {
        expect(() => pruneStaleReplayStartTimes(apiKey, Date.now(), logger)).not.toThrow();
      } finally {
        restore();
      }
    });

    test('swallows and logs errors during iteration', () => {
      // Seed an entry so the loop actually enters and reaches storage.key().
      globalThis.localStorage.setItem(`${prefix}sess1`, String(Date.now()));
      const restore = overrideStorageMethod('key', () => {
        throw new Error('boom');
      });
      try {
        expect(() => pruneStaleReplayStartTimes(apiKey, 1_700_000_000_000, logger)).not.toThrow();
        expect(logger.debug).toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    test('no-op when storage is unavailable', () => {
      const orig = globalThis.localStorage;
      Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
      try {
        expect(() => pruneStaleReplayStartTimes(apiKey, 1_700_000_000_000, logger)).not.toThrow();
      } finally {
        Object.defineProperty(globalThis, 'localStorage', { value: orig, configurable: true });
      }
    });

    test('swallows iteration errors without a logger', () => {
      globalThis.localStorage.setItem(`${prefix}sess1`, String(Date.now()));
      const restore = overrideStorageMethod('key', () => {
        throw new Error('boom');
      });
      try {
        expect(() => pruneStaleReplayStartTimes(apiKey, 1_700_000_000_000)).not.toThrow();
      } finally {
        restore();
      }
    });
  });
});
