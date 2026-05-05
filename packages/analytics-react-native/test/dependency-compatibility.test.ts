/**
 * Dependency Compatibility Tests
 *
 * These tests ensure that all exports from @amplitude/analytics-core that
 * analytics-react-native depends on are available and work correctly in
 * React Native environments.
 *
 * This prevents issues like https://github.com/amplitude/Amplitude-ReactNative/issues/181
 * where changes to analytics-core broke React Native compatibility.
 */

import {
  // Classes and functions used in config.ts
  Config,
  MemoryStorage,
  UUID,
  CookieStorage,
  getCookieName,
  getQueryParams,
  FetchTransport,

  // Classes and functions used in react-native-client.ts
  AmplitudeCore,
  Destination,
  returnWrapper,
  debugWrapper,
  getClientLogConfig,
  getClientStates,
  IdentityEventSender,
  getAnalyticsConnector,
  setConnectorDeviceId,
  setConnectorUserId,

  // Classes used in storage/local-storage.ts
  getGlobalScope,

  // Classes exported in index.ts
  Revenue,
  Identify,

  // Additional imports from migration and other files
  getOldCookieName,
  STORAGE_PREFIX,
} from '@amplitude/analytics-core';

// Type imports - verifying these are exported (compilation will fail if they're not)
import type {
  ReactNativeConfig as _ReactNativeConfig,
  ReactNativeOptions as _ReactNativeOptions,
  ReactNativeTrackingOptions as _ReactNativeTrackingOptions,
  ReactNativeAttributionOptions as _ReactNativeAttributionOptions,
  ReactNativeClient as _ReactNativeClient,
  Event as _Event,
  EventOptions as _EventOptions,
  Result as _Result,
  Storage as _Storage,
  UserSession as _UserSession,
  Campaign as _Campaign,
  IIdentify as _IIdentify,
  AnalyticsClient as _AnalyticsClient,
  ILogger as _ILogger,
} from '@amplitude/analytics-core';

// Helper to verify type exports at runtime - this ensures the types are properly exported
function verifyTypeExportsExist(): void {
  // These type assertions verify types are correctly exported from analytics-core
  // If any of these types are removed or renamed, this will cause a compile error
  const _config: _ReactNativeConfig | null = null;
  const _options: _ReactNativeOptions | null = null;
  const _trackingOptions: _ReactNativeTrackingOptions | null = null;
  const _attributionOptions: _ReactNativeAttributionOptions | null = null;
  const _client: _ReactNativeClient | null = null;
  const _event: _Event | null = null;
  const _eventOptions: _EventOptions | null = null;
  const _result: _Result | null = null;
  const _storage: _Storage<unknown> | null = null;
  const _userSession: _UserSession | null = null;
  const _campaign: _Campaign | null = null;
  const _identify: _IIdentify | null = null;
  const _analyticsClient: _AnalyticsClient | null = null;
  const _logger: _ILogger | null = null;

  // Use the variables to prevent unused warnings
  void [
    _config,
    _options,
    _trackingOptions,
    _attributionOptions,
    _client,
    _event,
    _eventOptions,
    _result,
    _storage,
    _userSession,
    _campaign,
    _identify,
    _analyticsClient,
    _logger,
  ];
}

describe('analytics-core dependency compatibility', () => {
  describe('exports availability', () => {
    test('should export all required types', () => {
      // This test verifies that all required types are exported from analytics-core
      // If any type is removed or renamed, this will cause a compile error
      expect(() => verifyTypeExportsExist()).not.toThrow();
    });

    test('should export all required functions', () => {
      expect(typeof getGlobalScope).toBe('function');
      expect(typeof UUID).toBe('function');
      expect(typeof getCookieName).toBe('function');
      expect(typeof getOldCookieName).toBe('function');
      expect(typeof getQueryParams).toBe('function');
      expect(typeof returnWrapper).toBe('function');
      expect(typeof debugWrapper).toBe('function');
      expect(typeof getClientLogConfig).toBe('function');
      expect(typeof getClientStates).toBe('function');
      expect(typeof getAnalyticsConnector).toBe('function');
      expect(typeof setConnectorDeviceId).toBe('function');
      expect(typeof setConnectorUserId).toBe('function');
    });

    test('should export all required classes', () => {
      expect(typeof Config).toBe('function');
      expect(typeof MemoryStorage).toBe('function');
      expect(typeof CookieStorage).toBe('function');
      expect(typeof FetchTransport).toBe('function');
      expect(typeof AmplitudeCore).toBe('function');
      expect(typeof Destination).toBe('function');
      expect(typeof IdentityEventSender).toBe('function');
      expect(typeof Revenue).toBe('function');
      expect(typeof Identify).toBe('function');
    });

    test('should export STORAGE_PREFIX constant', () => {
      expect(typeof STORAGE_PREFIX).toBe('string');
      expect(STORAGE_PREFIX.length).toBeGreaterThan(0);
    });
  });

  describe('getGlobalScope in React Native environment', () => {
    test('should return a scope object', () => {
      const scope = getGlobalScope();
      expect(scope).toBeDefined();
    });

    test('should work when document is undefined', () => {
      const scope = getGlobalScope();
      // In React Native, document might not exist, but getGlobalScope should still work
      expect(() => getGlobalScope()).not.toThrow();
      expect(scope).toBeDefined();
    });
  });

  describe('MemoryStorage compatibility', () => {
    test('should be instantiable', () => {
      const storage = new MemoryStorage<string>();
      expect(storage).toBeInstanceOf(MemoryStorage);
    });

    test('should implement Storage interface', async () => {
      const storage = new MemoryStorage<string>();

      // Test all Storage interface methods
      expect(typeof storage.isEnabled).toBe('function');
      expect(typeof storage.get).toBe('function');
      expect(typeof storage.set).toBe('function');
      expect(typeof storage.remove).toBe('function');
      expect(typeof storage.reset).toBe('function');

      // Test functionality
      const isEnabled = await storage.isEnabled();
      expect(isEnabled).toBe(true);

      await storage.set('testKey', 'testValue');
      const value = await storage.get('testKey');
      expect(value).toBe('testValue');

      await storage.remove('testKey');
      const removedValue = await storage.get('testKey');
      expect(removedValue).toBeUndefined();
    });
  });

  describe('CookieStorage compatibility in non-browser environment', () => {
    test('should be instantiable', () => {
      const storage = new CookieStorage();
      expect(storage).toBeInstanceOf(CookieStorage);
    });

    test('should handle missing document gracefully', async () => {
      const storage = new CookieStorage<string>();

      // Should not throw even if document is not available
      expect(async () => {
        await storage.isEnabled();
      }).not.toThrow();

      // set should not throw even without document
      expect(async () => {
        await storage.set('testKey', 'testValue');
      }).not.toThrow();
    });

    test('should implement Storage interface methods', () => {
      const storage = new CookieStorage<string>();

      expect(typeof storage.isEnabled).toBe('function');
      expect(typeof storage.get).toBe('function');
      expect(typeof storage.set).toBe('function');
      expect(typeof storage.remove).toBe('function');
      expect(typeof storage.reset).toBe('function');
    });
  });

  describe('FetchTransport compatibility', () => {
    test('should be instantiable', () => {
      const transport = new FetchTransport();
      expect(transport).toBeInstanceOf(FetchTransport);
    });

    test('should have send method', () => {
      const transport = new FetchTransport();
      expect(typeof transport.send).toBe('function');
    });
  });

  describe('UUID function', () => {
    test('should generate valid UUIDs', () => {
      const uuid = UUID();
      expect(typeof uuid).toBe('string');
      expect(uuid.length).toBeGreaterThan(0);
      // UUID v4 format
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test('should generate unique UUIDs', () => {
      const uuid1 = UUID();
      const uuid2 = UUID();
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('getCookieName function', () => {
    test('should generate consistent cookie names', () => {
      const name1 = getCookieName('test-api-key');
      const name2 = getCookieName('test-api-key');
      expect(name1).toBe(name2);
    });

    test('should generate different names for different API keys', () => {
      const name1 = getCookieName('api-key-1');
      const name2 = getCookieName('api-key-2');
      expect(name1).not.toBe(name2);
    });
  });

  describe('getQueryParams function', () => {
    test('should return an object', () => {
      const params = getQueryParams();
      expect(typeof params).toBe('object');
    });

    test('should not throw in React Native environment', () => {
      expect(() => getQueryParams()).not.toThrow();
    });
  });

  describe('Revenue class', () => {
    test('should be instantiable', () => {
      const revenue = new Revenue();
      expect(revenue).toBeInstanceOf(Revenue);
    });

    test('should have required methods', () => {
      const revenue = new Revenue();
      expect(typeof revenue.setProductId).toBe('function');
      expect(typeof revenue.setQuantity).toBe('function');
      expect(typeof revenue.setPrice).toBe('function');
      expect(typeof revenue.setRevenueType).toBe('function');
      expect(typeof revenue.setEventProperties).toBe('function');
      expect(typeof revenue.getEventProperties).toBe('function');
    });

    test('should chain methods correctly', () => {
      const revenue = new Revenue()
        .setProductId('product-123')
        .setQuantity(2)
        .setPrice(9.99)
        .setRevenueType('purchase');

      const props = revenue.getEventProperties();
      expect(props).toBeDefined();
    });
  });

  describe('Identify class', () => {
    test('should be instantiable', () => {
      const identify = new Identify();
      expect(identify).toBeInstanceOf(Identify);
    });

    test('should have required methods', () => {
      const identify = new Identify();
      expect(typeof identify.set).toBe('function');
      expect(typeof identify.setOnce).toBe('function');
      expect(typeof identify.append).toBe('function');
      expect(typeof identify.prepend).toBe('function');
      expect(typeof identify.remove).toBe('function');
      expect(typeof identify.add).toBe('function');
      expect(typeof identify.unset).toBe('function');
      expect(typeof identify.clearAll).toBe('function');
      expect(typeof identify.getUserProperties).toBe('function');
    });

    test('should chain methods correctly', () => {
      const identify = new Identify()
        .set('name', 'Test User')
        .setOnce('created_at', '2024-01-01')
        .add('login_count', 1);

      const props = identify.getUserProperties();
      expect(props).toBeDefined();
    });
  });

  describe('Config class', () => {
    test('should be instantiable with required options', () => {
      const transport = new FetchTransport();
      const config = new Config({ apiKey: 'test-api-key', transportProvider: transport });
      expect(config).toBeInstanceOf(Config);
      expect(config.apiKey).toBe('test-api-key');
    });
  });

  describe('Destination plugin', () => {
    test('should be instantiable', () => {
      const destination = new Destination();
      expect(destination).toBeInstanceOf(Destination);
    });

    test('should have setup and execute methods', () => {
      const destination = new Destination();
      expect(typeof destination.setup).toBe('function');
      expect(typeof destination.execute).toBe('function');
    });
  });

  describe('IdentityEventSender plugin', () => {
    test('should be instantiable', () => {
      const sender = new IdentityEventSender();
      expect(sender).toBeInstanceOf(IdentityEventSender);
    });
  });

  describe('Analytics connector integration', () => {
    test('getAnalyticsConnector should return connector', () => {
      const connector = getAnalyticsConnector();
      expect(connector).toBeDefined();
      expect(connector.identityStore).toBeDefined();
      expect(connector.eventBridge).toBeDefined();
    });

    test('setConnectorDeviceId should not throw', () => {
      expect(() => setConnectorDeviceId('test-device-id')).not.toThrow();
    });

    test('setConnectorUserId should not throw', () => {
      expect(() => setConnectorUserId('test-user-id')).not.toThrow();
    });
  });
});
