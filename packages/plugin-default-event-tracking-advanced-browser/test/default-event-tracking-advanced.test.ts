import { defaultEventTrackingAdvancedPlugin } from '../src/default-event-tracking-advanced-plugin';
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
    plugin = defaultEventTrackingAdvancedPlugin();
  });

  afterEach(() => {
    void plugin?.teardown?.();
    document.getElementsByTagName('body')[0].innerHTML = '';
    jest.clearAllMocks();
  });

  describe('name', () => {
    test('should return the plugin name', () => {
      expect(plugin?.name).toBe('@amplitude/plugin-default-event-tracking-advanced-browser');
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

  describe('auto-tracked events', () => {
    const API_KEY = 'API_KEY';
    const USER_ID = 'USER_ID';

    let instance = createInstance();
    let track: jest.SpyInstance;

    beforeEach(async () => {
      plugin = defaultEventTrackingAdvancedPlugin();
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

      const h2 = document.createElement('h2');
      h2.textContent = 'my-h2-text';
      document.body.appendChild(h2);

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
        '[Amplitude] Element Parent Label': 'my-h2-text',
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
        '[Amplitude] Element Parent Label': 'my-h2-text',
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

    test('should not track disallowed tag', async () => {
      const div = document.createElement('div');
      div.setAttribute('id', 'my-div-id');
      document.body.appendChild(div);

      plugin = defaultEventTrackingAdvancedPlugin();
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click div
      document.getElementById('my-div-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(0);

      // trigger click link
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(1);
    });

    describe('cssSelectorAllowlist configuration', () => {
      test('should only track selector class', async () => {
        const button = document.createElement('button');
        const buttonText = document.createTextNode('submit');
        button.setAttribute('id', 'my-button-id');
        button.setAttribute('class', 'my-button-class');
        button.appendChild(buttonText);
        document.body.appendChild(button);

        plugin = defaultEventTrackingAdvancedPlugin({ cssSelectorAllowlist: ['.my-button-class'] });
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

      test('should be able to track non-default tags by overwriting default cssSelectorAllowlist', async () => {
        const div = document.createElement('div');
        div.textContent = 'my-div-text';
        div.setAttribute('id', 'my-div-id');
        document.body.appendChild(div);

        const button = document.createElement('button');
        button.textContent = 'my-button-text';
        button.setAttribute('id', 'my-button-id');
        document.body.appendChild(button);

        plugin = defaultEventTrackingAdvancedPlugin({ cssSelectorAllowlist: ['div'] });
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
        expect(track).toHaveBeenCalledTimes(0);

        // trigger click div
        document.getElementById('my-div-id')?.dispatchEvent(new Event('click'));
        expect(track).toHaveBeenCalledTimes(1);
      });

      test('should respect default cssSelectorAllowlist', async () => {
        const div1 = document.createElement('div');
        div1.textContent = 'my-div-text1';
        div1.setAttribute('id', 'my-div-id1');
        div1.className = 'amp-default-track'; // default css class to enable tracking
        document.body.appendChild(div1);

        const div2 = document.createElement('div');
        div2.textContent = 'my-div-text2';
        div2.setAttribute('id', 'my-div-id2');
        div2.setAttribute('data-amp-default-track', ''); // default data attribute to enable tracking
        document.body.appendChild(div2);

        const button = document.createElement('button');
        button.textContent = 'my-button-text';
        button.setAttribute('id', 'my-button-id');
        document.body.appendChild(button);

        plugin = defaultEventTrackingAdvancedPlugin();
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

        // trigger click div1
        document.getElementById('my-div-id1')?.dispatchEvent(new Event('click'));
        expect(track).toHaveBeenCalledTimes(2);

        // trigger click div2
        document.getElementById('my-div-id2')?.dispatchEvent(new Event('click'));
        expect(track).toHaveBeenCalledTimes(3);
      });
    });

    test('should follow pageUrlAllowlist configuration', async () => {
      plugin = defaultEventTrackingAdvancedPlugin({ pageUrlAllowlist: [new RegExp('https://www.test.com')] });
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

    test('should follow shouldTrackEventResolver configuration', async () => {
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

      plugin = defaultEventTrackingAdvancedPlugin({
        shouldTrackEventResolver: (actionType, element) =>
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

      plugin = defaultEventTrackingAdvancedPlugin({
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
        '[Amplitude] Element Parent Label': 'my-h2-text',
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

    test('should not throw error when there is text node added to the page', async () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as Logger,
      };
      await plugin?.setup(config as BrowserConfig, instance);

      const textNode = document.createTextNode('Some text node');
      document.body.appendChild(textNode);

      const div = document.createElement('div');
      div.setAttribute('id', 'my-div-id');
      div.setAttribute('class', 'my-div-class');
      document.body.appendChild(div);

      // allow mutation observer to execute and event listener to be attached
      await new Promise((r) => r(undefined)); // basically, await next clock tick

      // trigger click input
      document.getElementById('my-div-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(0);
    });

    describe('when facing nested elements', () => {
      /*
        <div id="container2">
          <div id="container1">
            <div id="inner">
              click me
            </div>
          </div>
        </div>
        cssSelectorAllowlist: ['div']
        expect: only track inner, as we should only track the innermost allowed element
      */
      test('should only fire event for the inner element when container element also matches the allowlist and is the same tag', async () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <div id="container2">
            <div id="container1">
              <div id="inner">
                click me
              </div>
            </div>
          </div>
        `;

        plugin = defaultEventTrackingAdvancedPlugin({ cssSelectorAllowlist: ['div'] });
        const loggerProvider: Partial<Logger> = {
          log: jest.fn(),
          warn: jest.fn(),
        };
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider as Logger,
        };
        await plugin?.setup(config as BrowserConfig, instance);

        // trigger click inner
        document.getElementById('inner')?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenNthCalledWith(
          1,
          '[Amplitude] Element Clicked',
          expect.objectContaining({
            '[Amplitude] Element ID': 'inner',
          }),
        );

        // trigger click container
        document.getElementById('container1')?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(track).toHaveBeenCalledTimes(2);
        expect(track).toHaveBeenNthCalledWith(
          2,
          '[Amplitude] Element Clicked',
          expect.objectContaining({
            '[Amplitude] Element ID': 'container1',
          }),
        );
      });

      /*
        <div id="container2" class="match-me">
          <div id="container1" class="match-me">
            <div id="inner">
              click me
            </div>
          </div>
        </div>
        cssSelectorAllowlist: ['.match-me']
        expect: only track container1, as we should only track the innermost allowed element
      */
      test('should only fire event for the immediate parent element when inner element does not match but parent matches', async () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <div id="container2" class="match-me">
            <div id="container1" class="match-me">
              <div id="inner">
                click me
              </div>
            </div>
          </div>
        `;

        plugin = defaultEventTrackingAdvancedPlugin({ cssSelectorAllowlist: ['.match-me'] });
        const loggerProvider: Partial<Logger> = {
          log: jest.fn(),
          warn: jest.fn(),
        };
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider as Logger,
        };
        await plugin?.setup(config as BrowserConfig, instance);

        // trigger click inner
        document.getElementById('inner')?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenNthCalledWith(
          1,
          '[Amplitude] Element Clicked',
          expect.objectContaining({
            '[Amplitude] Element ID': 'container1',
          }),
        );

        // trigger click container
        document.getElementById('container1')?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(track).toHaveBeenCalledTimes(2);
        expect(track).toHaveBeenNthCalledWith(
          2,
          '[Amplitude] Element Clicked',
          expect.objectContaining({
            '[Amplitude] Element ID': 'container1',
          }),
        );
      });

      /*
        <button id="container">
          <div id="inner">
            click me
          </div>
        </button>
        cssSelectorAllowlist: ['button']
        expect: only track button click, as div is not allowed
      */
      test('should only fire event for the container element when inner element does not match the allowlist', async () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <button id="container">
            <div id="inner">
              click me
            </div>
          </button>
        `;

        plugin = defaultEventTrackingAdvancedPlugin({ cssSelectorAllowlist: ['button'] });
        const loggerProvider: Partial<Logger> = {
          log: jest.fn(),
          warn: jest.fn(),
        };
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider as Logger,
        };
        await plugin?.setup(config as BrowserConfig, instance);

        // trigger click inner
        document.getElementById('inner')?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenNthCalledWith(
          1,
          '[Amplitude] Element Clicked',
          expect.objectContaining({
            '[Amplitude] Element ID': 'container',
          }),
        );

        // trigger click container
        document.getElementById('container')?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(track).toHaveBeenCalledTimes(2);
        expect(track).toHaveBeenNthCalledWith(
          2,
          '[Amplitude] Element Clicked',
          expect.objectContaining({
            '[Amplitude] Element ID': 'container',
          }),
        );
      });

      /*
        <button id="container" data-track>
          <div id="inner" data-track>
            click me
          </div>
        </button>
        cssSelectorAllowlist: ['[data-track]']
        expect: only track div click, as div is innermost element that matches allowlist
        note: we do not track the button click here, this is a rare case that the inner div is also allowed
      */
      test('should only fire event for the inner element when container element also matches the allowlist and is different tag', async () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <button id="container" data-track>
            <div id="inner" data-track>
              click me
            </div>
          </button>
        `;

        plugin = defaultEventTrackingAdvancedPlugin({ cssSelectorAllowlist: ['[data-track]'] });
        const loggerProvider: Partial<Logger> = {
          log: jest.fn(),
          warn: jest.fn(),
        };
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider as Logger,
        };
        await plugin?.setup(config as BrowserConfig, instance);

        // trigger click inner
        document.getElementById('inner')?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenNthCalledWith(
          1,
          '[Amplitude] Element Clicked',
          expect.objectContaining({
            '[Amplitude] Element ID': 'inner',
          }),
        );

        // trigger click container
        document.getElementById('container')?.dispatchEvent(new Event('click', { bubbles: true }));
        expect(track).toHaveBeenCalledTimes(2);
        expect(track).toHaveBeenNthCalledWith(
          2,
          '[Amplitude] Element Clicked',
          expect.objectContaining({
            '[Amplitude] Element ID': 'container',
          }),
        );
      });
    });
  });

  describe('teardown', () => {
    // eslint-disable-next-line jest/expect-expect
    test('should teardown plugin', () => {
      void plugin?.teardown?.();
    });
  });
});
