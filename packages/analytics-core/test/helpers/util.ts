import { CookieStorage } from '../../src/storage/cookie';

export const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/**
 * Cookie names that are allowed to be set.
 *
 * IMPORTANT: do not add or modify these without good reason and
 * without very careful consideration. Cookie names should be very
 * stable and not changed without a good reason.
 */
const LEGAL_COOKIE_NAMES: Record<string, boolean> = {
  AMP_TEST: true,
  AMP_TLDTEST: true,
};

export function enforceStrictCookieNames() {
  const Proto = CookieStorage.prototype as unknown as { setSync: (key: string, value: unknown) => void };
  const originalSetSync = Proto.setSync;
  Proto.setSync = function (this: unknown, key: string, value: unknown) {
    if (!LEGAL_COOKIE_NAMES[key]) {
      throw new Error(`Illegal cookie name: ${key}`);
    }
    return originalSetSync.call(this, key, value);
  };

  return () => {
    Proto.setSync = originalSetSync;
  };
}
