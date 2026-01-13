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
  RemoteConfigClient,
  Identify,
  Revenue,
  getStorageKey,
  OfflineDisabled,
  Status,
  DEFAULT_ACTION_CLICK_ALLOWLIST,
  DEFAULT_DEAD_CLICK_ALLOWLIST,
  DEFAULT_RAGE_CLICK_ALLOWLIST,
  DEFAULT_ERROR_CLICK_ALLOWLIST,
  DEFAULT_RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD,
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
  getPageTitle,
  TEXT_MASK_ATTRIBUTE,
  MASKED_TEXT_VALUE,
  replaceSensitiveString,
  CC_REGEX,
  SSN_REGEX,
  EMAIL_REGEX,
  generateHashCode,
  isTimestampInSample,
  DiagnosticsClient,
  registerSdkLoaderMetadata,
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
    expect(typeof RemoteConfigClient).toBe('function');
    expect(() => new RemoteConfigClient('api-key', new Logger())).not.toThrow();
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
    expect(typeof DEFAULT_ERROR_CLICK_ALLOWLIST).toBe('object');
    expect(typeof DEFAULT_RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD).toBe('number');
    expect(DEFAULT_RAGE_CLICK_THRESHOLD).toBeGreaterThan(1);
    expect(DEFAULT_RAGE_CLICK_WINDOW_MS).toBeGreaterThan(1);
    expect(DEFAULT_DEAD_CLICK_WINDOW_MS).toBeGreaterThan(1);
    expect(EMPTY_VALUE).toBe('EMPTY');
    expect(typeof BASE_CAMPAIGN).toBe('object');
    expect(typeof MKTG).toBe('string');
    expect(typeof CampaignParser).toBe('function');
    expect(typeof getPageTitle).toBe('function');
    expect(TEXT_MASK_ATTRIBUTE).toBe('data-amp-mask');
    expect(MASKED_TEXT_VALUE).toBe('*****');
    expect(typeof replaceSensitiveString).toBe('function');
    expect(CC_REGEX).toBeInstanceOf(RegExp);
    expect(SSN_REGEX).toBeInstanceOf(RegExp);
    expect(EMAIL_REGEX).toBeInstanceOf(RegExp);
    expect(typeof generateHashCode).toBe('function');
    expect(typeof isTimestampInSample).toBe('function');
    expect(typeof DiagnosticsClient).toBe('function');
    expect(typeof registerSdkLoaderMetadata).toBe('function');
  });

  describe('replaceSensitiveString export', () => {
    test('should mask credit card numbers', () => {
      const result = replaceSensitiveString('CC: 4111111111111111');
      expect(result).toContain(MASKED_TEXT_VALUE);
    });

    test('should mask SSN', () => {
      const result = replaceSensitiveString('SSN: 123-45-6789');
      expect(result).toContain(MASKED_TEXT_VALUE);
    });

    test('should mask email addresses', () => {
      const result = replaceSensitiveString('Email: user@example.com');
      expect(result).toContain(MASKED_TEXT_VALUE);
    });

    test('should work with custom patterns', () => {
      const customPattern = /secret/gi;
      const result = replaceSensitiveString('This is secret', [customPattern]);
      expect(result).toContain(MASKED_TEXT_VALUE);
    });
  });

  describe('Regex exports', () => {
    test('CC_REGEX should match credit card numbers', () => {
      expect(CC_REGEX.test('4111111111111111')).toBe(true);
      expect(CC_REGEX.test('4111 1111 1111 1111')).toBe(true);
    });

    test('SSN_REGEX should match social security numbers', () => {
      SSN_REGEX.lastIndex = 0;
      expect(SSN_REGEX.test('123-45-6789')).toBe(true);
      SSN_REGEX.lastIndex = 0;
      expect(SSN_REGEX.test('123456789')).toBe(true);
    });

    test('EMAIL_REGEX should match email addresses', () => {
      EMAIL_REGEX.lastIndex = 0;
      expect(EMAIL_REGEX.test('user@example.com')).toBe(true);
      EMAIL_REGEX.lastIndex = 0;
      expect(EMAIL_REGEX.test('test.email@domain.co.uk')).toBe(true);
    });
  });
});
