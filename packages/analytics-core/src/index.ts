export { AmplitudeCore } from './core-client';
export { Identify } from './identify';
export { Revenue } from './revenue';
export { Destination } from './plugins/destination';
export { Config, RequestMetadata } from './config';
export { Logger } from './logger';
export { AMPLITUDE_PREFIX, STORAGE_PREFIX } from './constants';
export { returnWrapper } from './utils/return-wrapper';
export { debugWrapper, getClientLogConfig, getClientStates } from './utils/debug';
export { UUID } from './utils/uuid';
export { MemoryStorage } from './storage/memory';
export { BaseTransport } from './transports/base';
export { createIdentifyEvent } from './utils/event-builder';

export { getGlobalScope } from './global-scope';

// The following APIs are available in browser environment only.

// The following APIs are available in node environment only.
