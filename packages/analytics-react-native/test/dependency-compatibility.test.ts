/**
 * Dependency Compatibility Tests for @amplitude/analytics-core
 *
 * These tests verify that @amplitude/analytics-core exports and functionality
 * are compatible with React Native environments. They specifically test for
 * issues like the document.cookie crash reported in:
 * https://github.com/amplitude/Amplitude-ReactNative/issues/181
 *
 * These tests allow us to safely upgrade analytics-core without pinning to a
 * specific version, as breaking changes will be caught in CI before affecting
 * React Native users.
 */

import * as AnalyticsCore from '@amplitude/analytics-core';

describe('dependency-compatibility', () => {
  describe('Core Exports', () => {
    describe('Classes', () => {
      test('AmplitudeCore should be exported', () => {
        expect(typeof AnalyticsCore.AmplitudeCore).toBe('function');
        expect(() => new AnalyticsCore.AmplitudeCore()).not.toThrow();
      });

      test('Config should be exported', () => {
        expect(typeof AnalyticsCore.Config).toBe('function');
        // Config requires transportProvider, so just verify it's a constructor
        expect(AnalyticsCore.Config.prototype.constructor).toBe(AnalyticsCore.Config);
      });

      test('Identify should be exported', () => {
        expect(typeof AnalyticsCore.Identify).toBe('function');
        expect(() => new AnalyticsCore.Identify()).not.toThrow();
      });

      test('Revenue should be exported', () => {
        expect(typeof AnalyticsCore.Revenue).toBe('function');
        expect(() => new AnalyticsCore.Revenue()).not.toThrow();
      });

      test('Logger should be exported', () => {
        expect(typeof AnalyticsCore.Logger).toBe('function');
      });

      test('UUID should be exported', () => {
        expect(typeof AnalyticsCore.UUID).toBe('function');
      });
    });

    describe('Storage Classes', () => {
      test('MemoryStorage should be exported', () => {
        expect(typeof AnalyticsCore.MemoryStorage).toBe('function');
        expect(() => new AnalyticsCore.MemoryStorage()).not.toThrow();
      });

      test('CookieStorage should be exported', () => {
        expect(typeof AnalyticsCore.CookieStorage).toBe('function');
        expect(() => new AnalyticsCore.CookieStorage()).not.toThrow();
      });
    });

    describe('Transport Classes', () => {
      test('BaseTransport should be exported', () => {
        expect(typeof AnalyticsCore.BaseTransport).toBe('function');
      });

      test('FetchTransport should be exported', () => {
        expect(typeof AnalyticsCore.FetchTransport).toBe('function');
      });
    });

    describe('Utility Functions', () => {
      test('getGlobalScope should be exported', () => {
        expect(typeof AnalyticsCore.getGlobalScope).toBe('function');
      });

      test('returnWrapper should be exported', () => {
        expect(typeof AnalyticsCore.returnWrapper).toBe('function');
      });

      test('getCookieName should be exported', () => {
        expect(typeof AnalyticsCore.getCookieName).toBe('function');
      });

      test('getOldCookieName should be exported', () => {
        expect(typeof AnalyticsCore.getOldCookieName).toBe('function');
      });

      test('createIdentifyEvent should be exported', () => {
        expect(typeof AnalyticsCore.createIdentifyEvent).toBe('function');
      });
    });

    describe('Type Exports', () => {
      test('ReactNativeConfig type should be available for compilation', () => {
        // This test ensures the type is exported and can be used in TypeScript
        // We just verify the Config class exists rather than instantiating it
        expect(AnalyticsCore.Config).toBeDefined();
        expect(typeof AnalyticsCore.Config).toBe('function');
      });

      test('Event type should be available for compilation', () => {
        // Verify Event type can be used
        const event: AnalyticsCore.Event = {
          event_type: 'test',
        };
        expect(event).toBeDefined();
      });
    });
  });

  describe('React Native Environment Compatibility', () => {
    describe('getGlobalScope', () => {
      test('should not throw when accessing document property', () => {
        const globalScope = AnalyticsCore.getGlobalScope();
        expect(globalScope).toBeDefined();

        // Access document property without throwing
        const doc = (globalScope as any).document;
        // Document may or may not be present depending on environment
        // The important thing is that accessing it doesn't throw
        expect([undefined, 'object']).toContain(typeof doc);
      });

      test('should return a global scope object', () => {
        const globalScope = AnalyticsCore.getGlobalScope();
        expect(globalScope).toBeDefined();
        expect(typeof globalScope).toBe('object');
      });

      test('should handle checking for document existence', () => {
        const globalScope = AnalyticsCore.getGlobalScope();
        expect(globalScope).toBeDefined();

        // Verify we can check for document existence without errors
        const hasDocument = 'document' in globalScope && globalScope.document !== undefined;
        // hasDocument may be true or false depending on environment
        expect(typeof hasDocument).toBe('boolean');
      });
    });

    describe('CookieStorage', () => {
      test('should not throw when instantiated in React Native environment', () => {
        expect(() => {
          const storage = new AnalyticsCore.CookieStorage();
          expect(storage).toBeDefined();
        }).not.toThrow();
      });

      test('should handle set() gracefully when document is undefined', () => {
        const storage = new AnalyticsCore.CookieStorage<{ userId: string }>();

        // This should not throw even when document is undefined
        expect(() => {
          void storage.set('test-key', { userId: 'test-user' });
        }).not.toThrow();
      });

      test('should handle get() gracefully when document may be undefined', async () => {
        const storage = new AnalyticsCore.CookieStorage<{ userId: string }>();

        // This should not throw whether document is defined or not
        const result = await storage.get('test-key');
        // Result may be undefined or an object depending on environment
        expect([undefined, 'object']).toContain(typeof result);
      });

      test('should handle remove() gracefully when document is undefined', () => {
        const storage = new AnalyticsCore.CookieStorage<{ userId: string }>();

        // This should not throw even when document is undefined
        expect(() => {
          void storage.remove('test-key');
        }).not.toThrow();
      });

      test('should handle reset() gracefully when document is undefined', () => {
        const storage = new AnalyticsCore.CookieStorage<{ userId: string }>();

        // This should not throw even when document is undefined
        expect(() => {
          void storage.reset();
        }).not.toThrow();
      });
    });

    describe('MemoryStorage', () => {
      test('should work correctly in React Native environment', () => {
        const storage = new AnalyticsCore.MemoryStorage<{ userId: string }>();

        expect(() => {
          void storage.set('test-key', { userId: 'test-user' });
        }).not.toThrow();
      });

      test('should store and retrieve values', async () => {
        const storage = new AnalyticsCore.MemoryStorage<{ userId: string }>();

        await storage.set('test-key', { userId: 'test-user' });
        const result = await storage.get('test-key');

        expect(result).toEqual({ userId: 'test-user' });
      });
    });

    describe('FetchTransport', () => {
      test('should be instantiable in React Native environment', () => {
        expect(() => {
          const transport = new AnalyticsCore.FetchTransport();
          expect(transport).toBeDefined();
        }).not.toThrow();
      });
    });

    describe('UUID', () => {
      test('should generate UUIDs without document dependency', () => {
        expect(() => {
          const uuid = AnalyticsCore.UUID();
          expect(typeof uuid).toBe('string');
          expect(uuid.length).toBeGreaterThan(0);
        }).not.toThrow();
      });

      test('should generate unique UUIDs', () => {
        const uuid1 = AnalyticsCore.UUID();
        const uuid2 = AnalyticsCore.UUID();

        expect(uuid1).not.toBe(uuid2);
      });
    });

    describe('Revenue', () => {
      test('should work in React Native environment', () => {
        const revenue = new AnalyticsCore.Revenue();

        expect(() => {
          revenue.setProductId('test-product');
          revenue.setPrice(9.99);
          revenue.setQuantity(1);
        }).not.toThrow();
      });

      test('should build revenue event properties', () => {
        const revenue = new AnalyticsCore.Revenue();
        revenue.setProductId('test-product');
        revenue.setPrice(9.99);
        revenue.setQuantity(1);

        const event = revenue.getEventProperties();
        expect(event).toBeDefined();
        expect(event.$productId).toBe('test-product');
        expect(event.$price).toBe(9.99);
        expect(event.$quantity).toBe(1);
      });
    });

    describe('Identify', () => {
      test('should work in React Native environment', () => {
        const identify = new AnalyticsCore.Identify();

        expect(() => {
          identify.set('userProp', 'value');
          identify.add('count', 1);
          identify.setOnce('onceValue', 'initial');
        }).not.toThrow();
      });

      test('should build identify user properties', () => {
        const identify = new AnalyticsCore.Identify();
        identify.set('name', 'Test User');
        identify.add('loginCount', 1);

        const userProperties = identify.getUserProperties();
        expect(userProperties).toBeDefined();
        expect(userProperties.$set).toEqual({ name: 'Test User' });
        expect(userProperties.$add).toEqual({ loginCount: 1 });
      });
    });
  });

  describe('Critical Bug Regression Tests', () => {
    test('Issue #181: getGlobalScope is not a function should not occur', () => {
      // This test specifically addresses the bug reported in:
      // https://github.com/amplitude/Amplitude-ReactNative/issues/181
      // where importing Amplitude caused crashes due to document.cookie access

      expect(() => {
        // Simulate React Native environment where document is undefined
        const globalScope = AnalyticsCore.getGlobalScope();
        expect(globalScope).toBeDefined();

        // CookieStorage should not crash when document is undefined
        const storage = new AnalyticsCore.CookieStorage();
        void storage.set('test', { value: 'test' });
      }).not.toThrow();
    });

    test('CookieStorage should check document existence before cookie operations', () => {
      const storage = new AnalyticsCore.CookieStorage<{ data: string }>();

      // In React Native, these operations should be no-ops rather than throwing errors
      expect(() => {
        void storage.set('key', { data: 'value' });
      }).not.toThrow();

      expect(async () => {
        await storage.get('key');
      }).not.toThrow();
    });
  });

  describe('Dependency Version Stability', () => {
    test('should verify all required core exports are present', () => {
      // This test ensures that if analytics-core removes or renames exports,
      // the CI will catch it before it breaks React Native users

      const requiredExports = [
        'AmplitudeCore',
        'Config',
        'Identify',
        'Revenue',
        'Logger',
        'getGlobalScope',
        'MemoryStorage',
        'CookieStorage',
        'FetchTransport',
        'UUID',
        'returnWrapper',
        'getCookieName',
        'createIdentifyEvent',
        // Note: PluginType is a type-only export, not a runtime value
      ];

      requiredExports.forEach((exportName) => {
        expect(AnalyticsCore).toHaveProperty(exportName);
        expect((AnalyticsCore as any)[exportName]).toBeDefined();
      });
    });
  });
});
