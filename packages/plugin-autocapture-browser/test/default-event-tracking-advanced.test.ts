import { autocapturePlugin } from '../src/autocapture-plugin';
import * as hierarchyModule from '../src/hierarchy';

import { BrowserConfig, EnrichmentPlugin, ILogger, BrowserClient } from '@amplitude/analytics-core';
import { mockWindowLocationFromURL } from './utils';
import { VERSION } from '../src/version';
import { createMockBrowserClient } from './mock-browser-client';

const TESTING_DEBOUNCE_TIME = 4;

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
    plugin = autocapturePlugin({ debounceTime: TESTING_DEBOUNCE_TIME });
  });

  afterEach(() => {
    void plugin?.teardown?.();
    document.getElementsByTagName('body')[0].innerHTML = '';
    jest.clearAllMocks();
  });

  describe('name', () => {
    test('should return the plugin name', () => {
      expect(plugin?.name).toBe('@amplitude/plugin-autocapture-browser');
    });
  });

  describe('type', () => {
    test('should return the plugin type', () => {
      expect(plugin?.type).toBe('enrichment');
    });
  });

  describe('version', () => {
    test('should return the plugin version', () => {
      expect(VERSION != null).toBe(true);
    });
  });

  describe('setup', () => {
    test('should setup successfully', async () => {
      const loggerProvider: Partial<ILogger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as ILogger,
      };
      const amplitude: Partial<BrowserClient> = {};
      await plugin?.setup?.(config as BrowserConfig, amplitude as BrowserClient);
      expect(loggerProvider.warn).toHaveBeenCalledTimes(0);
      expect(loggerProvider.log).toHaveBeenCalledTimes(1);
      expect(loggerProvider.log).toHaveBeenNthCalledWith(1, `${plugin?.name as string} has been successfully added.`);
    });

    test('should setup visual tagging selector', async () => {
      window.opener = true;
      const messengerMock = {
        setup: jest.fn(),
      };
      plugin = autocapturePlugin({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        visualTaggingOptions: { enabled: true, messenger: messengerMock as any },
      });
      const loggerProvider: Partial<ILogger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as ILogger,
      };
      const amplitude: Partial<BrowserClient> = {};
      await plugin?.setup?.(config as BrowserConfig, amplitude as BrowserClient);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((messengerMock as any).setup).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute', () => {
    test('should return the same event type', async () => {
      const event = await plugin?.execute?.({
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

    let instance = createMockBrowserClient();
    let track: jest.SpyInstance;
    let loggerProvider: ILogger;

    beforeEach(async () => {
      loggerProvider = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as unknown as ILogger;
      plugin = autocapturePlugin({ debounceTime: TESTING_DEBOUNCE_TIME });
      instance = createMockBrowserClient();
      await instance.init(API_KEY, USER_ID).promise;
      track = jest.spyOn(instance, 'track').mockImplementation(jest.fn());

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
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Class': 'my-link-class',
        '[Amplitude] Element Hierarchy': [
          {
            attrs: {
              'aria-label': 'my-link',
              href: 'https://www.amplitude.com/click-link',
            },
            classes: ['my-link-class'],
            id: 'my-link-id',
            index: 0,
            indexOfType: 0,
            tag: 'a',
          },
          {
            index: 1,
            indexOfType: 0,
            prevSib: 'head',
            tag: 'body',
          },
        ],
        '[Amplitude] Element Href': 'https://www.amplitude.com/click-link',
        '[Amplitude] Element ID': 'my-link-id',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Tag': 'a',
        '[Amplitude] Element Text': 'my-link-text',
        '[Amplitude] Element Aria Label': 'my-link',
        '[Amplitude] Element Parent Label': 'my-h2-text',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
        '[Amplitude] Viewport Height': 768,
        '[Amplitude] Viewport Width': 1024,
      });

      // stop observer and listeners
      await plugin?.teardown?.();

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      // assert no additional event was tracked
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should only collect element hierarchy once', async () => {
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // add spy to getHierarchy
      jest.spyOn(hierarchyModule, 'getHierarchy');

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Element Clicked',
        expect.objectContaining({
          '[Amplitude] Element Hierarchy': [
            {
              attrs: {
                'aria-label': 'my-link',
                href: 'https://www.amplitude.com/click-link',
              },
              classes: ['my-link-class'],
              id: 'my-link-id',
              index: 0,
              indexOfType: 0,
              tag: 'a',
            },
            {
              index: 1,
              indexOfType: 0,
              prevSib: 'head',
              tag: 'body',
            },
          ],
        }),
      );

      // stop observer and listeners
      await plugin?.teardown?.();

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      // assert getHierarchy was only called once since it is expensive
      expect(hierarchyModule.getHierarchy).toHaveBeenCalledTimes(1);
    });

    // In the browser, this would happen in form elements due to named property accessors
    // form > input[name="id"]
    // However in jsdom, this behavior is not implemented, so we set the id to the input element itself
    // Note: in a browser, setting an id directly already casts to a string
    test('should not error when element properties resolve to an element', async () => {
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // Create scenario where element properties are elements
      const formEl = document.createElement('form');
      formEl.id = 'my-form-id';
      formEl.setAttribute('data-attr', 'testing');
      document.body.appendChild(formEl);

      const input1 = document.createElement('input');
      formEl.appendChild(input1);

      // Set attributes to an element to test if they are cast to a string
      formEl.id = input1 as unknown as string;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      formEl.classList = input1 as unknown as Array<string>;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      formEl.className = input1 as unknown as string;

      const submitButton = document.createElement('button');
      submitButton.setAttribute('type', 'submit');
      formEl.appendChild(submitButton);

      // trigger click event
      submitButton?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Element Clicked',
        expect.objectContaining({
          '[Amplitude] Element Hierarchy': [
            { attrs: { type: 'submit' }, index: 1, indexOfType: 0, prevSib: 'input', tag: 'button' },
            {
              attrs: { 'data-attr': 'testing' },
              classes: ['[object', 'HTMLInputElement]'],
              id: '[object HTMLInputElement]',
              index: 2,
              indexOfType: 0,
              prevSib: 'h2',
              tag: 'form',
            },
            { index: 1, indexOfType: 0, prevSib: 'head', tag: 'body' },
          ],
        }),
      );

      // stop observer and listeners
      await plugin?.teardown?.();

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      // assert no additional event was tracked
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should track click event properties immediately', async () => {
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click event
      const linkEl = document.getElementById('my-link-id') as HTMLAnchorElement;
      linkEl?.dispatchEvent(new Event('click'));

      // Change the link text immediately after click
      linkEl.textContent = 'updated-link-text';

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Class': 'my-link-class',
        '[Amplitude] Element Hierarchy': [
          {
            attrs: {
              'aria-label': 'my-link',
              href: 'https://www.amplitude.com/click-link',
            },
            classes: ['my-link-class'],
            id: 'my-link-id',
            index: 0,
            indexOfType: 0,
            tag: 'a',
          },
          {
            index: 1,
            indexOfType: 0,
            prevSib: 'head',
            tag: 'body',
          },
        ],
        '[Amplitude] Element Href': 'https://www.amplitude.com/click-link',
        '[Amplitude] Element ID': 'my-link-id',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Tag': 'a',
        '[Amplitude] Element Text': 'my-link-text',
        '[Amplitude] Element Aria Label': 'my-link',
        '[Amplitude] Element Parent Label': 'my-h2-text',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
        '[Amplitude] Viewport Height': 768,
        '[Amplitude] Viewport Width': 1024,
      });

      // stop observer and listeners
      await plugin?.teardown?.();

      // trigger click event
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      // assert no additional event was tracked
      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should monitor element clicked event when dynamically rendered', async () => {
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click event
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.setAttribute('id', 'my-button-id');
      button.setAttribute('class', 'my-button-class');
      button.setAttribute('aria-label', 'my-button');
      button.appendChild(buttonText);
      document.body.appendChild(button);

      document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Class': 'my-button-class',
        '[Amplitude] Element Hierarchy': [
          {
            attrs: {
              'aria-label': 'my-button',
            },
            classes: ['my-button-class'],
            id: 'my-button-id',
            index: 2,
            indexOfType: 0,
            prevSib: 'h2',
            tag: 'button',
          },
          {
            index: 1,
            indexOfType: 0,
            prevSib: 'head',
            tag: 'body',
          },
        ],
        '[Amplitude] Element ID': 'my-button-id',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Tag': 'button',
        '[Amplitude] Element Text': 'submit',
        '[Amplitude] Element Aria Label': 'my-button',
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
    test('should track clicks to elements added after initial load', async () => {
      const body = document.body;
      const bodyParent = body?.parentNode;
      bodyParent?.removeChild(body);

      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      bodyParent?.appendChild(body);
      // fire the load event, so that the mutation observer can be mounted
      window.dispatchEvent(new Event('load'));

      // Create new button after DOM load
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.setAttribute('id', 'my-button-id');
      button.setAttribute('class', 'my-button-class');
      button.setAttribute('aria-label', 'my-button');
      button.appendChild(buttonText);
      document.body.appendChild(button);

      // trigger click event
      document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Class': 'my-button-class',
        '[Amplitude] Element Hierarchy': [
          {
            attrs: {
              'aria-label': 'my-button',
            },
            classes: ['my-button-class'],
            id: 'my-button-id',
            index: 2,
            indexOfType: 0,
            prevSib: 'h2',
            tag: 'button',
          },
          {
            index: 1,
            indexOfType: 0,
            prevSib: 'head',
            tag: 'body',
          },
        ],
        '[Amplitude] Element ID': 'my-button-id',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Tag': 'button',
        '[Amplitude] Element Text': 'submit',
        '[Amplitude] Element Aria Label': 'my-button',
        '[Amplitude] Element Parent Label': 'my-h2-text',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
        '[Amplitude] Viewport Height': 768,
        '[Amplitude] Viewport Width': 1024,
      });

      // stop observer and listeners
      await plugin?.teardown?.();
    });
    test('should not track disallowed tag', async () => {
      const div = document.createElement('div');
      div.setAttribute('id', 'my-div-id');
      document.body.appendChild(div);

      plugin = autocapturePlugin({ debounceTime: TESTING_DEBOUNCE_TIME });

      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click div which should not be tracked
      document.getElementById('my-div-id')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(0);

      // trigger click link
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

        plugin = autocapturePlugin({
          cssSelectorAllowlist: ['.my-button-class'],
          debounceTime: TESTING_DEBOUNCE_TIME,
        });
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider,
        };
        await plugin?.setup?.(config as BrowserConfig, instance);

        // trigger click link
        document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

        expect(track).toHaveBeenCalledTimes(0);

        // trigger click button
        document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

        // Use only div in allowlist
        plugin = autocapturePlugin({ cssSelectorAllowlist: ['div'], debounceTime: TESTING_DEBOUNCE_TIME });
        const loggerProvider: Partial<ILogger> = {
          log: jest.fn(),
          warn: jest.fn(),
        };
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider as ILogger,
        };
        await plugin?.setup?.(config as BrowserConfig, instance);

        // trigger click button
        document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

        expect(track).toHaveBeenCalledTimes(0);

        // trigger click div
        document.getElementById('my-div-id')?.dispatchEvent(new Event('click'));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

        plugin = autocapturePlugin({ debounceTime: TESTING_DEBOUNCE_TIME });
        const loggerProvider: Partial<ILogger> = {
          log: jest.fn(),
          warn: jest.fn(),
        };
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider as ILogger,
        };
        await plugin?.setup?.(config as BrowserConfig, instance);

        // trigger click button
        document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

        expect(track).toHaveBeenCalledTimes(1);

        // trigger click div1
        document.getElementById('my-div-id1')?.dispatchEvent(new Event('click'));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

        expect(track).toHaveBeenCalledTimes(2);

        // trigger click div2
        document.getElementById('my-div-id2')?.dispatchEvent(new Event('click'));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

        expect(track).toHaveBeenCalledTimes(3);
      });
    });

    test('should follow pageUrlAllowlist configuration', async () => {
      plugin = autocapturePlugin({
        pageUrlAllowlist: [new RegExp('https://www.test.com')],
        debounceTime: TESTING_DEBOUNCE_TIME,
      });

      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click link
      document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

      // trigger click link
      document.getElementById('my-link-id-new-url')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

      plugin = autocapturePlugin({
        shouldTrackEventResolver: (actionType, element) =>
          actionType === 'click' && element.getAttribute('id') === 'my-button-id-1' && element.tagName === 'BUTTON',
        debounceTime: TESTING_DEBOUNCE_TIME,
      });

      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click button2
      document.getElementById('my-button-id-2')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(0);

      // trigger click button1
      document.getElementById('my-button-id-1')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

      plugin = autocapturePlugin({
        dataAttributePrefix: 'data-amp-test-',
        debounceTime: TESTING_DEBOUNCE_TIME,
      });

      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click button
      document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Class': 'my-button-class',
        '[Amplitude] Element Hierarchy': [
          {
            attrs: {
              'data-amp-test-hello': 'world',
              'data-amp-test-test': '',
              'data-amp-test-time': 'machine',
            },
            classes: ['my-button-class'],
            id: 'my-button-id',
            index: 2,
            indexOfType: 0,
            prevSib: 'h2',
            tag: 'button',
          },

          {
            index: 1,
            indexOfType: 0,
            prevSib: 'head',
            tag: 'body',
          },
        ],
        '[Amplitude] Element ID': 'my-button-id',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Tag': 'button',
        '[Amplitude] Element Text': 'submit',
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
    test('should follow default debounceTime configuration', async () => {
      const oldFetch = global.fetch;
      global.fetch = jest.fn(() =>
        Promise.resolve({
          json: () =>
            Promise.resolve({
              code: 200,
            }),
        }),
      ) as jest.Mock;
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.setAttribute('id', 'my-button-id');
      button.appendChild(buttonText);
      document.body.appendChild(button);

      plugin = autocapturePlugin();

      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click button
      document.getElementById('my-button-id')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, 0));
      expect(track).toHaveBeenCalledTimes(1);

      global.fetch = oldFetch;
    });

    test('should track change event', async () => {
      const input = document.createElement('input');
      input.setAttribute('id', 'my-input-id');
      input.setAttribute('class', 'my-input-class');
      document.body.appendChild(input);

      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click input
      document.getElementById('my-input-id')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

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

      const loggerProvider: Partial<ILogger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as ILogger,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

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

      const loggerProvider: Partial<ILogger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as ILogger,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click input
      document.getElementById('my-div-id')?.dispatchEvent(new Event('click'));
      expect(track).toHaveBeenCalledTimes(0);

      // trigger change input
      document.getElementById('my-div-id')?.dispatchEvent(new Event('change'));
      expect(track).toHaveBeenCalledTimes(0);
    });

    test('should not throw error when there is text node added to the page', async () => {
      const loggerProvider: Partial<ILogger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider as ILogger,
      };
      await plugin?.setup?.(config as BrowserConfig, instance);

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

        plugin = autocapturePlugin({ cssSelectorAllowlist: ['div'], debounceTime: TESTING_DEBOUNCE_TIME });
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider,
        };
        await plugin?.setup?.(config as BrowserConfig, instance);

        // trigger click inner
        document.getElementById('inner')?.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

        plugin = autocapturePlugin({ cssSelectorAllowlist: ['.match-me'], debounceTime: TESTING_DEBOUNCE_TIME });
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider,
        };
        await plugin?.setup?.(config as BrowserConfig, instance);

        // trigger click inner
        document.getElementById('inner')?.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

        plugin = autocapturePlugin({ cssSelectorAllowlist: ['button'], debounceTime: TESTING_DEBOUNCE_TIME });
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider,
        };
        await plugin?.setup?.(config as BrowserConfig, instance);

        // trigger click inner
        document.getElementById('inner')?.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

        plugin = autocapturePlugin({ cssSelectorAllowlist: ['[data-track]'], debounceTime: TESTING_DEBOUNCE_TIME });
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider,
        };
        await plugin?.setup?.(config as BrowserConfig, instance);

        // trigger click inner
        document.getElementById('inner')?.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

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

    test('should not track click for an event fired without a target', async () => {
      const event = new Event('click', {
        bubbles: true,
        cancelable: true,
      });

      window.dispatchEvent(event);

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(0);
    });

    describe('rage click detection:', () => {
      test('clicking on the same element 4 times should track 4 clicks separately', async () => {
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider,
        };
        await plugin?.setup?.(config as BrowserConfig, instance);

        const button = document.createElement('button');
        document.body.appendChild(button);

        // trigger click event
        button.dispatchEvent(new Event('click'));
        button.dispatchEvent(new Event('click'));
        button.dispatchEvent(new Event('click'));
        button.dispatchEvent(new Event('click'));

        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));
        expect(track).toHaveBeenCalledTimes(4);
      });

      // TODO: this will change in the future
      test('clicking on the same element 5 times should track 6 clicks separately', async () => {
        const config: Partial<BrowserConfig> = {
          defaultTracking: false,
          loggerProvider: loggerProvider,
        };
        await plugin?.setup?.(config as BrowserConfig, instance);

        const button = document.createElement('button');
        document.body.appendChild(button);

        // trigger click event
        button.dispatchEvent(new Event('click'));
        button.dispatchEvent(new Event('click'));
        button.dispatchEvent(new Event('click'));
        button.dispatchEvent(new Event('click'));
        button.dispatchEvent(new Event('click'));
        button.dispatchEvent(new Event('click'));

        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));
        expect(track).toHaveBeenCalledTimes(6);
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
