/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  AmplitudeCore,
  BaseTransport,
  Destination,
  Config,
  Logger,
  LogLevel,
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
  isNewSession,
  getQueryParams,
  getCookieName,
  getOldCookieName,
  getLanguage,
  IdentityEventSender,
  CookieStorage,
  FetchTransport,
  Identify,
  Revenue,
  getStorageKey,
  OfflineDisabled,
  Status,
  DEFAULT_ACTION_CLICK_ALLOWLIST,
  DEFAULT_DEAD_CLICK_ALLOWLIST,
  DEFAULT_RAGE_CLICK_ALLOWLIST,
  DEFAULT_CSS_SELECTOR_ALLOWLIST,
  DEFAULT_RAGE_CLICK_THRESHOLD,
  DEFAULT_RAGE_CLICK_WINDOW_MS,
  DEFAULT_DEAD_CLICK_WINDOW_MS,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
  RevenueProperty,
  IdentifyOperation,
  SpecialEventType,
  ServerZone,
  BASE_CAMPAIGN,
  CampaignParser,
  EMPTY_VALUE,
  MKTG,
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
    expect(typeof Identify).toBe('function');
    expect(typeof Revenue).toBe('function');
    expect(typeof BaseTransport).toBe('function');
    expect(typeof Destination).toBe('function');
    expect(typeof Config).toBe('function');
    expect(typeof RequestMetadata).toEqual('function');
    expect(typeof Logger).toBe('function');
    expect(typeof LogLevel).toBe('object');
    expect(typeof returnWrapper).toBe('function');
    expect(typeof debugWrapper).toBe('function');
    expect(typeof getClientLogConfig).toBe('function');
    expect(typeof getClientStates).toBe('function');
    expect(typeof UUID).toBe('function');
    expect(typeof MemoryStorage).toBe('function');
    expect(typeof createIdentifyEvent).toBe('function');
    expect(AMPLITUDE_PREFIX).toBe('AMP');
    expect(STORAGE_PREFIX).toBe('AMP_unsent');
    expect(typeof getStorageKey).toBe('function');
    expect(typeof getGlobalScope).toBe('function');
    expect(typeof getAnalyticsConnector).toBe('function');
    expect(typeof setConnectorDeviceId).toBe('function');
    expect(typeof setConnectorUserId).toBe('function');
    expect(typeof isNewSession).toBe('function');
    expect(typeof getQueryParams).toBe('function');
    expect(typeof getCookieName).toBe('function');
    expect(typeof getOldCookieName).toBe('function');
    expect(typeof getLanguage).toBe('function');
    expect(typeof IdentityEventSender).toBe('function');
    expect(() => new IdentityEventSender()).not.toThrow();
    expect(typeof CookieStorage).toBe('function');
    expect(() => new CookieStorage()).not.toThrow();
    expect(typeof FetchTransport).toBe('function');
    expect(() => new FetchTransport()).not.toThrow();
    expect(OfflineDisabled).toBe(null);
    expect(typeof OfflineDisabled).toBe('object');
    expect(typeof Status).toBe('object');
    expect(typeof DEFAULT_ACTION_CLICK_ALLOWLIST).toBe('object');
    expect(typeof DEFAULT_CSS_SELECTOR_ALLOWLIST).toBe('object');
    expect(typeof DEFAULT_DEAD_CLICK_ALLOWLIST).toBe('object');
    expect(typeof DEFAULT_RAGE_CLICK_ALLOWLIST).toBe('object');
    expect(typeof DEFAULT_DATA_ATTRIBUTE_PREFIX).toBe('string');
    expect(typeof RevenueProperty).toBe('object');
    expect(typeof IdentifyOperation).toBe('object');
    expect(typeof SpecialEventType).toBe('object');
    expect(typeof ServerZone).toBe('object');
    expect(DEFAULT_RAGE_CLICK_THRESHOLD).toBeGreaterThan(1);
    expect(DEFAULT_RAGE_CLICK_WINDOW_MS).toBeGreaterThan(1);
    expect(DEFAULT_DEAD_CLICK_WINDOW_MS).toBeGreaterThan(1);
    expect(EMPTY_VALUE).toBe('EMPTY');
    expect(typeof BASE_CAMPAIGN).toBe('object');
    expect(typeof MKTG).toBe('string');
    expect(typeof CampaignParser).toBe('function');
  });
});
