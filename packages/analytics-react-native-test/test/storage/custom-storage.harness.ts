/**
 * On-device harness for custom in-memory storage with AsyncStorage unavailable.
 *
 * Runs on a real device/simulator (not Jest/Node).
 * Requires react-native-harness + examples/react-native/app built and installed.
 *
 * The host app excludes RNCAsyncStorage from native autolinking (SDKRN-8).
 * This test additionally forces AsyncStorage APIs to throw, then verifies the
 * SDK still initializes and persists identity via custom MemoryStorage.
 */
/* eslint-disable @typescript-eslint/no-unsafe-argument,import/no-extraneous-dependencies, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, afterEach } from 'react-native-harness';
import { MemoryStorage, getCookieName, type Event, type UserSession } from '@amplitude/analytics-core';
import { createInstance, Types } from '@amplitude/analytics-react-native';

const API_KEY = 'dummyApiKey';
const DEVICE_ID = 'custom-storage-device-id';
const USER_ID = 'harness-custom-storage-user';

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

let restoreAsyncStorage: (() => void) | undefined;

async function waitForStoredSessionId(
  cookieStorage: MemoryStorage<UserSession>,
  expectedSessionId: number,
  timeoutMs = 2000,
): Promise<UserSession> {
  const key = getCookieName(API_KEY);
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const stored = await cookieStorage.get(key);
    if (stored?.sessionId === expectedSessionId) {
      return stored;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const stored = await cookieStorage.get(key);
  throw new Error(
    `Timed out waiting for sessionId ${expectedSessionId} in cookieStorage; got ${JSON.stringify(stored)}`,
  );
}

/**
 * Make AsyncStorage unusable before SDK init.
 * - If the JS package loads, replace methods with throws.
 * - If require itself throws (native module null), treat that as already blown up.
 */
function breakAsyncStorage(): void {
  try {
    const mod = require('@react-native-async-storage/async-storage');
    const asyncStorage = (mod?.default ?? mod) as AsyncStorageLike | undefined;
    if (!asyncStorage) {
      return;
    }

    const originals = {
      getItem: asyncStorage.getItem.bind(asyncStorage),
      setItem: asyncStorage.setItem.bind(asyncStorage),
      removeItem: asyncStorage.removeItem.bind(asyncStorage),
      clear: asyncStorage.clear.bind(asyncStorage),
    };
    const boom = () => Promise.reject(new Error('NativeModule: AsyncStorage is null'));
    asyncStorage.getItem = boom;
    asyncStorage.setItem = boom;
    asyncStorage.removeItem = boom;
    asyncStorage.clear = boom;

    restoreAsyncStorage = () => {
      asyncStorage.getItem = originals.getItem;
      asyncStorage.setItem = originals.setItem;
      asyncStorage.removeItem = originals.removeItem;
      asyncStorage.clear = originals.clear;
    };
  } catch {
    // Package blows up on require when the native module is excluded — expected.
    restoreAsyncStorage = undefined;
  }
}

describe('custom memory storage', () => {
  afterEach(() => {
    restoreAsyncStorage?.();
    restoreAsyncStorage = undefined;
  });

  it('sets device/session identity when AsyncStorage is broken and custom MemoryStorage is used', async () => {
    breakAsyncStorage();

    const cookieStorage = new MemoryStorage<UserSession>();
    const storageProvider = new MemoryStorage<Event[]>();

    const client = createInstance();
    await client.init(API_KEY, USER_ID, {
      deviceId: DEVICE_ID,
      cookieStorage,
      storageProvider,
      flushQueueSize: 1,
      logLevel: Types.LogLevel.None,
      attribution: {
        disabled: true,
      },
      migrateLegacyData: false,
    } as any).promise;

    expect(client.getUserId()).toBe(USER_ID);
    expect(client.getDeviceId()).toBe(DEVICE_ID);

    const sessionId = client.getSessionId();
    expect(typeof sessionId).toBe('number');
    expect(sessionId).toBeGreaterThan(0);

    // updateStorage is fire-and-forget; wait for the initial write.
    const stored = await waitForStoredSessionId(cookieStorage, sessionId!);
    expect(stored.userId).toBe(USER_ID);
    expect(stored.deviceId).toBe(DEVICE_ID);

    const nextSessionId = sessionId! + 1;
    client.setSessionId(nextSessionId);
    expect(client.getSessionId()).toBe(nextSessionId);

    const storedAfterSession = await waitForStoredSessionId(cookieStorage, nextSessionId);
    expect(storedAfterSession.deviceId).toBe(DEVICE_ID);
    expect(storedAfterSession.userId).toBe(USER_ID);
  });
});
