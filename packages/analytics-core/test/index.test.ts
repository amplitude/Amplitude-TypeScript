/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  AmplitudeCore,
  BaseTransport,
  Destination,
  Config,
  Logger,
  AMPLITUDE_PREFIX,
  STORAGE_PREFIX,
  returnWrapper,
  debugWrapper,
  getClientLogConfig,
  getClientStates,
  UUID,
  MemoryStorage,
  createIdentifyEvent,
  RequestMetadata,
  getGlobalScope,
  getAnalyticsConnector,
  setConnectorDeviceId,
  setConnectorUserId,
  getPageViewTrackingConfig,
  getAttributionTrackingConfig,
  getElementInteractionsConfig,
  isAttributionTrackingEnabled,
  isFileDownloadTrackingEnabled,
  isFormInteractionTrackingEnabled,
  isPageViewTrackingEnabled,
  isSessionTrackingEnabled,
  isElementInteractionsEnabled,
  isNewSession,
  getQueryParams,
  getCookieName,
  getOldCookieName,
  getLanguage,
  IdentityEventSender,
  WebAttribution,
  CookieStorage,
  FetchTransport,
} from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    const client = new AmplitudeCore();
    expect(typeof (client as any)._init).toBe('function');
    expect(typeof client.track).toBe('function');
    expect(typeof client.logEvent).toBe('function');
    expect(typeof client.identify).toBe('function');
    expect(typeof client.groupIdentify).toBe('function');
    expect(typeof client.setGroup).toBe('function');
    expect(typeof client.setOptOut).toBe('function');
    expect(typeof client.revenue).toBe('function');
    expect(typeof client.add).toBe('function');
    expect(typeof client.remove).toBe('function');
    expect(typeof BaseTransport).toBe('function');
    expect(typeof Destination).toBe('function');
    expect(typeof Config).toBe('function');
    expect(typeof RequestMetadata).toEqual('function');
    expect(typeof Logger).toBe('function');
    expect(typeof returnWrapper).toBe('function');
    expect(typeof debugWrapper).toBe('function');
    expect(typeof getClientLogConfig).toBe('function');
    expect(typeof getClientStates).toBe('function');
    expect(typeof UUID).toBe('function');
    expect(typeof MemoryStorage).toBe('function');
    expect(typeof createIdentifyEvent).toBe('function');
    expect(AMPLITUDE_PREFIX).toBe('AMP');
    expect(STORAGE_PREFIX).toBe('AMP_unsent');
    expect(typeof getGlobalScope).toBe('function');
    expect(typeof getAnalyticsConnector).toBe('function');
    expect(typeof setConnectorDeviceId).toBe('function');
    expect(typeof setConnectorUserId).toBe('function');
    expect(typeof getPageViewTrackingConfig).toBe('function');
    expect(typeof getAttributionTrackingConfig).toBe('function');
    expect(typeof getElementInteractionsConfig).toBe('function');
    expect(typeof isAttributionTrackingEnabled).toBe('function');
    expect(typeof isFileDownloadTrackingEnabled).toBe('function');
    expect(typeof isFormInteractionTrackingEnabled).toBe('function');
    expect(typeof isPageViewTrackingEnabled).toBe('function');
    expect(typeof isSessionTrackingEnabled).toBe('function');
    expect(typeof isElementInteractionsEnabled).toBe('function');
    expect(typeof isNewSession).toBe('function');
    expect(typeof getQueryParams).toBe('function');
    expect(typeof getCookieName).toBe('function');
    expect(typeof getOldCookieName).toBe('function');
    expect(typeof getLanguage).toBe('function');
    expect(typeof getPageViewTrackingConfig).toBe('function');
    expect(typeof IdentityEventSender).toBe('function');
    expect(() => new IdentityEventSender()).not.toThrow();
    expect(typeof WebAttribution).toBe('function');
    expect(typeof CookieStorage).toBe('function');
    expect(() => new CookieStorage()).not.toThrow();
    expect(typeof FetchTransport).toBe('function');
    expect(() => new FetchTransport()).not.toThrow();
  });
});
