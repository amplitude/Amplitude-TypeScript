import { BrowserClient, BrowserConfig, EnrichmentPlugin, Logger } from '@amplitude/analytics-types';
import { gaEventsForwarderPlugin } from '../src/ga-events-forwarder';
import { MOCK_URL } from './constants';

describe('gaEventsForwarderPlugin', () => {
  let plugin: EnrichmentPlugin | undefined;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const sendBeacon = window.navigator.sendBeacon;
  const sendBeaconMock = jest.fn();

  beforeAll(() => {
    window.navigator.sendBeacon = sendBeaconMock;
  });

  beforeEach(() => {
    plugin = gaEventsForwarderPlugin();
  });

  afterEach(() => {
    void plugin?.teardown?.();
  });

  afterAll(() => {
    window.navigator.sendBeacon = sendBeacon;
  });

  describe('name', () => {
    test('should return the plugin name', () => {
      expect(plugin?.name).toBe('@amplitude/plugin-gtag-forwarder-browser');
    });
  });

  describe('type', () => {
    test('should return the plugin type', () => {
      expect(plugin?.type).toBe('enrichment');
    });
  });

  describe('setup', () => {
    test('should setup successfully', async () => {
      // NOTE: Calling teardown to replace bigger-scoped plugin to pass string input
      await plugin?.teardown?.();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      plugin = gaEventsForwarderPlugin({
        trackingIds: 'G-XXXXXXXXXX',
      });
      // NOTE: Calling teardown to replace bigger-scoped plugin to pass string input

      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        error: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        loggerProvider: loggerProvider as Logger,
      };
      const amplitude: Partial<BrowserClient> = {};
      await plugin?.setup(config as BrowserConfig, amplitude as BrowserClient);
      expect(loggerProvider.error).toHaveBeenCalledTimes(0);
      expect(loggerProvider.log).toHaveBeenCalledTimes(1);
      expect(loggerProvider.log).toHaveBeenNthCalledWith(
        1,
        '@amplitude/plugin-gtag-forwarder-browser is successfully added.',
      );
    });

    test('should handle invalid input', async () => {
      // NOTE: Calling teardown to replace bigger-scoped plugin to pass invalid input
      await plugin?.teardown?.();
      plugin = gaEventsForwarderPlugin({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        trackingIds: [true],
      });
      // NOTE: Calling teardown to replace bigger-scoped plugin to pass invalid input

      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        error: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        loggerProvider: loggerProvider as Logger,
      };
      await plugin.setup(config as BrowserConfig);
      expect(loggerProvider.error).toHaveBeenCalledTimes(1);
      expect(loggerProvider.error).toHaveBeenNthCalledWith(
        1,
        '@amplitude/plugin-gtag-forwarder-browser received an invalid input for Tracking IDs. Tracking IDs must be a string or an array of strings.',
      );
      expect(loggerProvider.log).toHaveBeenCalledTimes(0);
    });

    test('should handle incompatible Amplitude SDK version', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        error: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig);
      expect(loggerProvider.error).toHaveBeenCalledTimes(1);
      expect(loggerProvider.error).toHaveBeenNthCalledWith(
        1,
        '@amplitude/plugin-gtag-forwarder-browser is not compatible with Amplitude SDK version. This plugin requires Amplitude SDK version 1.9.1 or later.',
      );
      expect(loggerProvider.log).toHaveBeenCalledTimes(1);
      expect(loggerProvider.log).toHaveBeenNthCalledWith(1, '@amplitude/plugin-gtag-forwarder-browser is removed.');
    });
  });

  describe('execute', () => {
    test('should return the return the same event type', async () => {
      const event = await plugin?.execute({
        event_type: 'custom_event',
      });
      expect(event).toEqual({
        event_type: 'custom_event',
      });
    });
  });

  describe('teardown', () => {
    test('should reset state', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(window.navigator.sendBeacon).not.toBe(sendBeaconMock);
      void plugin?.teardown?.();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(window.navigator.sendBeacon).toBe(sendBeaconMock);
    });
  });

  describe('integration', () => {
    const requestPayload = 'en=page_view&_ee=1\\r\\en=custom_event&_ee=1&epn.1=1&ep.a=a&upn.2=2&up.b=b';

    test('should send events to Amplitude tracked before Amplitude SDK is initialized', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        error: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        loggerProvider: loggerProvider as Logger,
      };
      const amplitude: Partial<BrowserClient> = {
        track: jest.fn(),
      };

      // 1. Send event to Google Analytics
      window.navigator.sendBeacon(MOCK_URL, requestPayload);
      // 2. Setup is called when Amplitude SDK is initialized
      await plugin?.setup(config as BrowserConfig, amplitude as BrowserClient);

      expect(amplitude.track).toHaveBeenCalledTimes(2);
      expect(amplitude.track).toHaveBeenNthCalledWith(1, {
        device_id: '1129698125.1691607592',
        event_properties: {},
        event_type: 'page_view',
        session_id: 1691687380,
        user_id: 'kevinp@amplitude.com',
        user_properties: {},
      });
      expect(amplitude.track).toHaveBeenNthCalledWith(2, {
        device_id: '1129698125.1691607592',
        event_properties: {
          '1': 1,
          a: 'a',
        },
        event_type: 'custom_event',
        session_id: 1691687380,
        user_id: 'kevinp@amplitude.com',
        user_properties: {
          '2': 2,
          b: 'b',
        },
      });
    });

    test('should send events to Amplitude tracked after Amplitude SDK is initialized', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        error: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        loggerProvider: loggerProvider as Logger,
      };
      const amplitude: Partial<BrowserClient> = {
        track: jest.fn(),
      };

      // 1. Setup is called when Amplitude SDK is initialized
      await plugin?.setup(config as BrowserConfig, amplitude as BrowserClient);
      // 2.Send event to Google Analytics
      window.navigator.sendBeacon(MOCK_URL, requestPayload);

      expect(amplitude.track).toHaveBeenCalledTimes(2);
      expect(amplitude.track).toHaveBeenNthCalledWith(1, {
        device_id: '1129698125.1691607592',
        event_properties: {},
        event_type: 'page_view',
        session_id: 1691687380,
        user_id: 'kevinp@amplitude.com',
        user_properties: {},
      });
      expect(amplitude.track).toHaveBeenNthCalledWith(2, {
        device_id: '1129698125.1691607592',
        event_properties: {
          '1': 1,
          a: 'a',
        },
        event_type: 'custom_event',
        session_id: 1691687380,
        user_id: 'kevinp@amplitude.com',
        user_properties: {
          '2': 2,
          b: 'b',
        },
      });
    });

    test('should ignore non-GA events', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        error: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        loggerProvider: loggerProvider as Logger,
      };
      const amplitude: Partial<BrowserClient> = {
        track: jest.fn(),
      };

      // 1. Setup is called when Amplitude SDK is initialized
      await plugin?.setup(config as BrowserConfig, amplitude as BrowserClient);
      // 2.Send event to Google Analytics
      window.navigator.sendBeacon('https://api2.amplitude.com/2/httpapi');

      expect(amplitude.track).toHaveBeenCalledTimes(0);
    });

    test('should catch invalid URL error', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        error: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        loggerProvider: loggerProvider as Logger,
      };
      const amplitude: Partial<BrowserClient> = {
        track: jest.fn(),
      };

      // 1. Setup is called when Amplitude SDK is initialized
      await plugin?.setup(config as BrowserConfig, amplitude as BrowserClient);
      // 2.Send event to Google Analytics
      expect(window.navigator.sendBeacon('🤷‍♂️')).not.toThrow();

      expect(amplitude.track).toHaveBeenCalledTimes(0);
    });
  });
});
