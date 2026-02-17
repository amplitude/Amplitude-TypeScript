/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as safeJsonStringifyModule from 'safe-json-stringify';

// do a simple, typed re-export of "safe-json-stringify"
type SafeJsonStringifyFn = (data: object, replacer?: any, space?: string | number) => string;
const safeJsonStringify: SafeJsonStringifyFn =
  (safeJsonStringifyModule as any).default || (safeJsonStringifyModule as any);

export { safeJsonStringify };
