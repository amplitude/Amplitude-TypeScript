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
export { getAnalyticsConnector, setConnectorDeviceId, setConnectorUserId } from './analytics-connector';
export {
  getPageViewTrackingConfig,
  getAttributionTrackingConfig,
  getElementInteractionsConfig,
  isAttributionTrackingEnabled,
  isFileDownloadTrackingEnabled,
  isFormInteractionTrackingEnabled,
  isPageViewTrackingEnabled,
  isSessionTrackingEnabled,
  isElementInteractionsEnabled,
} from './default-tracking';
export { isNewSession } from './session';
export { IdentityEventSender } from './plugins/identity';
export { WebAttribution } from './attribution/web-attribution';
export { getQueryParams } from './query-params';
export { CookieStorage } from './storage/cookie';
export { getCookieName, getOldCookieName } from './cookie-name';
export { FetchTransport } from './transports/fetch';
export { getLanguage } from './language';

export { Event } from './event/event';
export { EventOptions } from './event/base-event';
export { Result } from './result';
