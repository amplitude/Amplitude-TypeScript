import { autoTrackingPlugin } from '../src/auto-tracking-plugin';
import { BrowserClient, BrowserConfig, EnrichmentPlugin, Logger } from '@amplitude/analytics-types';
import { createInstance } from '@amplitude/analytics-browser';

const mockWindowLocationFromURL = (url: URL) => {
  window.location.href = url.toString();
  window.location.search = url.search;
  window.location.hostname = url.hostname;
  window.location.pathname = url.pathname;
};

describe('autoTrackingPlugin', () => {
  let plugin: EnrichmentPlugin | undefined;

  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: '',
        href: '',
        pathname: '',
        search: '',
      },
      writable: true,
    });
  });

  beforeEach(() => {
    (window.location as any) = {
      hostname: '',
      href: '',
      pathname: '',
      search: '',
    };
    plugin = autoTrackingPlugin();
  });

  afterEach(() => {
    void plugin?.teardown?.();
    jest.clearAllMocks();
  });

  describe('name', () => {
    test('should return the plugin name', () => {
      expect(plugin?.name).toBe('@amplitude/plugin-auto-tracking-browser');
    });
  });

  describe('type', () => {
    test('should return the plugin type', () => {
      expect(plugin?.type).toBe('enrichment');
    });
  });

  describe('setup', () => {
    test('should setup successfully', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      const amplitude: Partial<BrowserClient> = {};
      await plugin?.setup?.(config as BrowserConfig, amplitude as BrowserClient);
      expect(loggerProvider.warn).toHaveBeenCalledTimes(0);
      expect(loggerProvider.log).toHaveBeenCalledTimes(1);
      expect(loggerProvider.log).toHaveBeenNthCalledWith(1, `${plugin?.name as string} has been successfully added.`);
    });

    test('should handle incompatible Amplitude SDK version', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup?.(config as BrowserConfig);
      expect(loggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(loggerProvider.warn).toHaveBeenNthCalledWith(
        1,
        `${
          plugin?.name as string
        } plugin requires a later version of @amplitude/analytics-browser. Events are not tracked.`,
      );
    });
  });

  describe('execute', () => {
    test('should return the same event type', async () => {
      const event = await plugin?.execute({
        event_type: 'custom_event',
      });
      expect(event).toEqual({
        event_type: 'custom_event',
      });
    });
  });

  describe('auto-tracking events', () => {
    const API_KEY = 'API_KEY';
    const USER_ID = 'USER_ID';

    let instance = createInstance();
    let track: jest.SpyInstance;

    beforeEach(async () => {
      plugin = autoTrackingPlugin();
      instance = createInstance();
      await instance.init(API_KEY, USER_ID).promise;
      track = jest.spyOn(instance, 'track');

      const link = document.createElement('a');
      link.setAttribute('id', 'my-link-id');
      link.setAttribute('class', 'my-link-class');
      link.setAttribute('aria-label', 'my-link');
      link.href = 'https://www.amplitude.com/click-link';
      link.text = 'my-link-text';
      document.body.appendChild(link);

      mockWindowLocationFromURL(new URL('https://www.amplitude.com/unit-test?query=param'));
    });

    afterEach(() => {
      document.querySelector('a#my-link-id')?.remove();
      document.querySelector('button#my-button-id')?.remove();
      document.querySelector('input#my-input-id')?.remove();
    });

    test('should monitor element clicked event', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Class': 'my-link-class',
        '[Amplitude] Element Href': 'https://www.amplitude.com/click-link',
        '[Amplitude] Element ID': 'my-link-id',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Tag': 'a',
        '[Amplitude] Element Text': 'my-link-text',
        '[Amplitude] Element Aria Label': 'my-link',
        '[Amplitude] Element Selector': '#my-link-id',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
        '[Amplitude] Viewport Height': 768,
        '[Amplitude] Viewport Width': 1024,
      });

      // stop observer and listeners
      await plugin?.teardown?.();

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      // assert no additional event was tracked
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should monitor element clicked event when dynamically rendered', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click event
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.setAttribute('id', 'my-button-id');
      button.setAttribute('class', 'my-button-class');
      button.setAttribute('aria-label', 'my-button');
      button.appendChild(buttonText);
      document.body.appendChild(button);
      // allow mutation observer to execute and event listener to be attached
      await new Promise((r) => r(undefined)); // basically, await next clock tick
      document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Class': 'my-button-class',
        '[Amplitude] Element ID': 'my-button-id',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Tag': 'button',
        '[Amplitude] Element Text': 'submit',
        '[Amplitude] Element Aria Label': 'my-button',
        '[Amplitude] Element Selector': '#my-button-id',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
        '[Amplitude] Viewport Height': 768,
        '[Amplitude] Viewport Width': 1024,
      });

      // stop observer and listeners
      await plugin?.teardown?.();

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      // assert no additional event was tracked
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should follow tagAllowlist configuration', async () => {
      plugin = autoTrackingPlugin({ tagAllowlist: ['button'] });
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      expect(track).toHaveBeenCalledTimes(0);
    });

    test('should follow cssSelectorAllowlist configuration', async () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.setAttribute('id', 'my-button-id');
      button.setAttribute('class', 'my-button-class');
      button.appendChild(buttonText);
      document.body.appendChild(button);

      plugin = autoTrackingPlugin({ cssSelectorAllowlist: ['.my-button-class'] });
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click link
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(0);

      // trigger click button
      document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should follow pageUrlAllowlist configuration', async () => {
      plugin = autoTrackingPlugin({ pageUrlAllowlist: ['https://www.test.com'] });
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click link
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(0);

      // update current page url to match allowlist
      mockWindowLocationFromURL(new URL('https://www.test.com/abc?query=param'));
      const link = document.createElement('a');
      link.setAttribute('id', 'my-link-id-new-url');
      link.setAttribute('class', 'my-link-class');
      link.setAttribute('aria-label', 'my-link');
      link.href = 'https://www.amplitude.com/test';
      link.text = 'my-link-text';
      document.body.appendChild(link);
      // allow mutation observer to execute and event listener to be attached
      await new Promise((r) => r(undefined)); // basically, await next clock tick

      // trigger click link
      document.getElementById('my-link-id-new-url')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should follow shouldTrackEventCallback configuration', async () => {
      const button1 = document.createElement('button');
      const buttonText1 = document.createTextNode('submit');
      button1.setAttribute('id', 'my-button-id-1');
      button1.setAttribute('class', 'my-button-class');
      button1.appendChild(buttonText1);
      document.body.appendChild(button1);

      const button2 = document.createElement('button');
      const buttonText2 = document.createTextNode('submit');
      button2.setAttribute('id', 'my-button-id-2');
      button2.setAttribute('class', 'my-button-class');
      button2.appendChild(buttonText2);
      document.body.appendChild(button2);

      plugin = autoTrackingPlugin({
        shouldTrackEventCallback: (actionType, element) =>
          actionType === 'click' && element.id === 'my-button-id-1' && element.tagName === 'BUTTON',
      });
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click button2
      document.getElementById('my-button-id-2')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(0);

      // trigger click button1
      document.getElementById('my-button-id-1')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should follow dataAttributePrefix configuration', async () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.setAttribute('id', 'my-button-id');
      button.setAttribute('class', 'my-button-class');
      button.setAttribute('data-amp-test-hello', 'world');
      button.setAttribute('data-amp-test-time', 'machine');
      button.setAttribute('data-amp-test-test', '');
      button.appendChild(buttonText);
      document.body.appendChild(button);

      plugin = autoTrackingPlugin({
        dataAttributePrefix: 'data-amp-test-',
      });
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click button
      document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Class': 'my-button-class',
        '[Amplitude] Element ID': 'my-button-id',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Tag': 'button',
        '[Amplitude] Element Text': 'submit',
        '[Amplitude] Element Selector': '#my-button-id',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
        '[Amplitude] Viewport Height': 768,
        '[Amplitude] Viewport Width': 1024,
        '[Amplitude] Element Attributes': {
          hello: 'world',
          time: 'machine',
          test: '',
        },
      });
    });

    test('should track change event', async () => {
      const input = document.createElement('input');
      input.setAttribute('id', 'my-input-id');
      input.setAttribute('class', 'my-input-class');
      document.body.appendChild(input);

      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click input
      document.getElementById('my-input-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(1);

      // trigger change input
      document.getElementById('my-input-id')?.dispatchEvent(new Event('change'));
      expect(track).toHaveBeenCalledTimes(2);
    });

    test('should not track when element type is hidden', async () => {
      const input = document.createElement('input');
      input.setAttribute('id', 'my-input-id');
      input.setAttribute('class', 'my-input-class');
      input.type = 'hidden';
      document.body.appendChild(input);

      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click input
      document.getElementById('my-input-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(0);

      // trigger change input
      document.getElementById('my-input-id')?.dispatchEvent(new Event('change'));
      expect(track).toHaveBeenCalledTimes(0);
    });

    test('should not track when element type is password', async () => {
      const input = document.createElement('input');
      input.setAttribute('id', 'my-input-id');
      input.setAttribute('class', 'my-input-class');
      input.type = 'password';
      document.body.appendChild(input);

      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click input
      document.getElementById('my-input-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(0);

      // trigger change input
      document.getElementById('my-input-id')?.dispatchEvent(new Event('change'));
      expect(track).toHaveBeenCalledTimes(0);
    });

    test('should not track for div tags', async () => {
      const div = document.createElement('div');
      div.setAttribute('id', 'my-div-id');
      div.setAttribute('class', 'my-div-class');
      document.body.appendChild(div);

      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click input
      document.getElementById('my-div-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(0);

      // trigger change input
      document.getElementById('my-div-id')?.dispatchEvent(new Event('change'));
      expect(track).toHaveBeenCalledTimes(0);
    });
  });

  describe('teardown', () => {
    // eslint-disable-next-line jest/expect-expect
    test('should teardown plugin', () => {
      void plugin?.teardown?.();
    });
  });
});
