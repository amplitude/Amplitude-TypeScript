/* eslint-disable @typescript-eslint/unbound-method */

import client from './node-client';
export { createInstance } from './node-client';
export const { add, groupIdentify, identify, init, logEvent, remove, revenue, setGroup, setOptOut, track, flush } =
  client;
export { Revenue, Identify } from '@amplitude/analytics-core';

// Export types to maintain backward compatibility with `analytics-types`.
// In the next major version, only export customer-facing types to reduce the public API surface.
export * as Types from './types';
