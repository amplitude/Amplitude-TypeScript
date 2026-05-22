import { Storage, getGlobalScope } from '@amplitude/analytics-core';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

let resolved = false;
let asyncStorage: AsyncStorageLike | undefined;

// Resolve AsyncStorage lazily so the module can be opted out of via custom
// `storageProvider` + `react-native.config.js` autolinking exclusion without
// the SDK throwing at module-load time.
//
// The result is cached for the app lifetime: `require()` is synchronous in
// React Native and the module registry is stable, so retrying after a failed
// resolution would never produce a different result.
const getAsyncStorage = (): AsyncStorageLike | undefined => {
  if (resolved) {
    return asyncStorage;
  }
  resolved = true;
  /* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  try {
    const mod = require('@react-native-async-storage/async-storage');
    // Handles both ES-module (`{ default: AsyncStorage }`) and direct-export
    // shapes — e.g. `jest.mock(..., () => mockAsyncStorage)` returns the mock
    // directly without a `default` wrapper.
    asyncStorage = mod?.default ?? mod;
  } catch (e) {
    asyncStorage = undefined;
    // Only swallow "package not installed" silently — that's the supported
    // opt-out path. Anything else (broken install, syntax error in the package,
    // permission issues) should be surfaced so it can be diagnosed instead of
    // silently degrading to in-memory storage.
    const code = (e as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'MODULE_NOT_FOUND') {
      // eslint-disable-next-line no-console
      console.warn('[Amplitude] Failed to load @react-native-async-storage/async-storage; persistence is disabled.', e);
    }
  }
  /* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  return asyncStorage;
};

export class LocalStorage<T> implements Storage<T> {
  async isEnabled(): Promise<boolean> {
    /* istanbul ignore if */
    if (!getGlobalScope()) {
      return false;
    }
    if (!getAsyncStorage()) {
      return false;
    }

    const random = String(Date.now());
    const testStorage = new LocalStorage<string>();
    const testKey = 'AMP_TEST';
    try {
      await testStorage.set(testKey, random);
      const value = await testStorage.get(testKey);
      return value === random;
    } catch {
      /* istanbul ignore next */
      return false;
    } finally {
      await testStorage.remove(testKey);
    }
  }

  async get(key: string): Promise<T | undefined> {
    try {
      const value = await this.getRaw(key);
      if (!value) {
        return undefined;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(value);
    } catch {
      /* istanbul ignore next */
      return undefined;
    }
  }

  async getRaw(key: string): Promise<string | undefined> {
    const storage = getAsyncStorage();
    if (!storage) {
      return undefined;
    }
    try {
      return (await storage.getItem(key)) || undefined;
    } catch {
      // AsyncStorage's JS package is resolvable but the native bridge is null
      // (e.g. customer excluded it via autolinking but the JS package is still
      // in node_modules). Callers like `parseOldCookies` consume `getRaw`
      // directly without their own try/catch, so we must not propagate.
      return undefined;
    }
  }

  async set(key: string, value: T): Promise<void> {
    const storage = getAsyncStorage();
    if (!storage) {
      return;
    }
    try {
      await storage.setItem(key, JSON.stringify(value));
    } catch {
      //
    }
  }

  async remove(key: string): Promise<void> {
    const storage = getAsyncStorage();
    if (!storage) {
      return;
    }
    try {
      await storage.removeItem(key);
    } catch {
      //
    }
  }

  async reset(): Promise<void> {
    const storage = getAsyncStorage();
    if (!storage) {
      return;
    }
    try {
      await storage.clear();
    } catch {
      //
    }
  }
}
