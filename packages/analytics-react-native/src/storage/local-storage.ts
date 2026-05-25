import { Storage, getGlobalScope } from '@amplitude/analytics-core';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Three sentinel states:
//   undefined - not tried yet
//   null      - tried, package isn't available (don't retry)
//   object    - tried, succeeded
//
// Resolve AsyncStorage lazily so the module can be opted out of via custom
// `storageProvider` + `react-native.config.js` autolinking exclusion without
// the SDK throwing at module-load time.
//
// The result is cached for the app lifetime: `require()` is synchronous in
// React Native and the module registry is stable, so retrying after a failed
// resolution would never produce a different result. Caching the failure as
// `null` lets us skip re-running `require()` on every storage call — Metro
// doesn't cache failed module resolutions, so without this we'd re-throw on
// every storage call. See https://nodejs.org/api/modules.html#requirecache
// for the success-case caching that `require()` gives us for free.
let asyncStorage: AsyncStorageLike | null | undefined = undefined;

const getAsyncStorage = (): AsyncStorageLike | null | undefined => {
  if (asyncStorage !== undefined) {
    return asyncStorage;
  }
  /* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  try {
    const mod = require('@react-native-async-storage/async-storage');
    // Handles both ES-module (`{ default: AsyncStorage }`) and direct-export
    // shapes — e.g. `jest.mock(..., () => mockAsyncStorage)` returns the mock
    // directly without a `default` wrapper. The outer `?? null` ensures we
    // never cache a falsy success value, which would be misread as "not tried".
    asyncStorage = mod?.default ?? mod ?? null;
  } catch (e) {
    asyncStorage = null;
    // Only swallow "this exact package is not installed" silently — that's
    // the supported opt-out path. Anything else — including a `MODULE_NOT_FOUND`
    // that's actually about a transitive dependency, or syntax/eval errors in
    // the package itself — should be surfaced so it can be diagnosed instead of
    // silently degrading to in-memory storage.
    const code = (e as NodeJS.ErrnoException | undefined)?.code;
    const message = e instanceof Error ? e.message : '';
    const ourPackageMissing =
      code === 'MODULE_NOT_FOUND' && message.includes('@react-native-async-storage/async-storage');
    if (!ourPackageMissing) {
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
