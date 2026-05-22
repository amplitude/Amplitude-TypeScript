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
const getAsyncStorage = (): AsyncStorageLike | undefined => {
  if (resolved) {
    return asyncStorage;
  }
  resolved = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const mod = require('@react-native-async-storage/async-storage');
    // Handles both ES-module (`{ default: AsyncStorage }`) and direct-export
    // shapes — e.g. `jest.mock(..., () => mockAsyncStorage)` returns the mock
    // directly without a `default` wrapper.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    asyncStorage = mod?.default ?? mod;
  } catch {
    asyncStorage = undefined;
  }
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
    return (await storage.getItem(key)) || undefined;
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
