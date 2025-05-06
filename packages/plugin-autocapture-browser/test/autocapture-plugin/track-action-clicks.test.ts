import { autocapturePlugin } from '../../src/autocapture-plugin';
import { BrowserConfig, EnrichmentPlugin, ILogger } from '@amplitude/analytics-core';
import { createInstance } from '@amplitude/analytics-browser';

const TESTING_DEBOUNCE_TIME = 4;

describe('action clicks:', () => {
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

  // ********** START TESTS **********

  describe('autotrack clicks that cause a change:', () => {
    const API_KEY = 'API_KEY';
    const USER_ID = 'USER_ID';

    let instance = createInstance();
    let track: jest.SpyInstance;

    const loggerProvider: Partial<ILogger> = {
      log: jest.fn(),
      warn: jest.fn(),
    };
    const config: Partial<BrowserConfig> = {
      defaultTracking: false,
      loggerProvider: loggerProvider as ILogger,
    };

    beforeEach(async () => {
      plugin = autocapturePlugin({ debounceTime: TESTING_DEBOUNCE_TIME });
      instance = createInstance();
      await instance.init(API_KEY, USER_ID).promise;
      track = jest.spyOn(instance, 'track');

      const content = `
        <div id="main" class="class1 class2" data-test-attr="test-attr">
          <div id="inner-left" class="column">
            <div id="addDivButton"><span id="inner-div-button-text">Add div</span></div>
            <div id="go-back-button">Go Back</div>
            <button id="real-button"><span id="button-text">Click me</span></button>
            <div class="red" id="no-action-div">No action div</div>
          </div>
          <div id="inner-right" class="column">
            <div class="card">
              <h1 id="card-title">Card Title</h1>
              <a href="https://google.com">Go to Google</a>
              <a href="#">Dead Link</a>
            </div>
          </div>
          <span data-testid="test-element">inner</span>
        </div>
      `;

      document.body.innerHTML = content;

      // Add event listener to div
      const addDivButton = document.getElementById('addDivButton');
      let divCount = 0;
      const addDiv = () => {
        divCount++;
        const newDiv = document.createElement('div');
        newDiv.className = 'new-div';
        newDiv.textContent = `This is div number ${divCount}`;
        document.body.appendChild(newDiv);
      };
      addDivButton?.addEventListener('click', addDiv);

      // Add event listener to card
      document.querySelector('.card')?.addEventListener('click', addDiv);

      const goBackButton = document.getElementById('go-back-button');
      const goBack = () => {
        history.pushState(null, '', '#new-hash');
      };
      goBackButton?.addEventListener('click', goBack);

      // mockWindowLocationFromURL(new URL('https://www.amplitude.com/unit-test?query=param'));
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    test('should track button click even if there is no DOM change', async () => {
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger 2 click events on button
      const realButton = document.getElementById('real-button');
      realButton?.dispatchEvent(new Event('click'));
      realButton?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(2);
    });

    test('should not track div click if it does not change the DOM or navigate', async () => {
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click event on div which is acting as a button
      document.getElementById('no-action-div')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));

      expect(track).toHaveBeenCalledTimes(0);
    });

    test('should track div click if it causes a DOM change', async () => {
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click event on div which is acting as a button
      document.getElementById('addDivButton')?.dispatchEvent(new Event('click'));
      document.getElementById('addDivButton')?.dispatchEvent(new Event('click'));
      document.getElementById('addDivButton')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Hierarchy': [
          {
            id: 'addDivButton',
            index: 0,
            indexOfType: 0,
            tag: 'div',
          },
          {
            id: 'inner-left',
            classes: ['column'],
            index: 0,
            indexOfType: 0,
            tag: 'div',
          },
          {
            attrs: {
              'data-test-attr': 'test-attr',
            },
            id: 'main',
            classes: ['class1', 'class2'],
            index: 0,
            indexOfType: 0,
            tag: 'div',
          },
          {
            index: 1,
            indexOfType: 0,
            prevSib: 'head',
            tag: 'body',
          },
        ],
        '[Amplitude] Element ID': 'addDivButton',
        '[Amplitude] Element Parent Label': 'Card Title',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Tag': 'div',
        '[Amplitude] Element Text': 'Add div',
        '[Amplitude] Viewport Height': 768,
        '[Amplitude] Viewport Width': 1024,
      });
    });

    test('should not trigger duplicate events if the immediate click target is in the action click allowlist', async () => {
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click event on span in a button
      document.getElementById('button-text')?.dispatchEvent(new Event('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));

      // should only track one event, the click on the button
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Element Clicked',
        expect.objectContaining({
          '[Amplitude] Element ID': 'real-button',
          '[Amplitude] Element Tag': 'button',
          '[Amplitude] Element Text': 'Click me',
        }),
      );
    });

    test('should trigger action click on innermost element', async () => {
      await plugin?.setup?.(config as BrowserConfig, instance);

      // trigger click event on span in a button
      document.getElementById('inner-div-button-text')?.dispatchEvent(new Event('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));

      // should only track one event, the click on the button
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Element Clicked',
        expect.objectContaining({
          '[Amplitude] Element ID': 'inner-div-button-text',
          '[Amplitude] Element Parent Label': 'Add div',
          '[Amplitude] Element Tag': 'span',
        }),
      );
    });

    describe('actionClickAllowlist configuration', () => {
      test('should be able to track non-default tags by overwriting default actionClickAllowlist', async () => {
        // Use only div in allowlist
        plugin = autocapturePlugin({ actionClickAllowlist: ['h1'], debounceTime: TESTING_DEBOUNCE_TIME });
        await plugin?.setup?.(config as BrowserConfig, instance);

        // trigger click on card which should result in no event since div is not in the allowlist
        document.querySelector('.card')?.dispatchEvent(new Event('click'));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));

        expect(track).toHaveBeenCalledTimes(0);
        expect(document.querySelectorAll('.new-div').length).toBe(1);

        // trigger click on h1 in card which should result in an action click since h1 is in the allowlist and a child
        // of the card which has the click event listener
        document.getElementById('card-title')?.dispatchEvent(new Event('click', { bubbles: true }));
        await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));

        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenNthCalledWith(
          1,
          '[Amplitude] Element Clicked',
          expect.objectContaining({
            '[Amplitude] Element ID': 'card-title',
            '[Amplitude] Element Parent Label': 'Card Title',
            '[Amplitude] Element Tag': 'h1',
          }),
        );
        expect(document.querySelectorAll('.new-div').length).toBe(2);
      });
    });

    test('should not track when element type is hidden', async () => {
      // Use only div in allowlist
      plugin = autocapturePlugin({ actionClickAllowlist: ['input'], debounceTime: TESTING_DEBOUNCE_TIME });
      await plugin?.setup?.(config as BrowserConfig, instance);

      const input = document.createElement('input');
      input.setAttribute('id', 'my-input-id');
      input.setAttribute('class', 'my-input-class');
      input.type = 'hidden';
      document.body.appendChild(input);

      // trigger click input
      document.getElementById('my-input-id')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));
      expect(track).toHaveBeenCalledTimes(0);

      // trigger change input
      document.getElementById('my-input-id')?.dispatchEvent(new Event('change'));
      expect(track).toHaveBeenCalledTimes(0);
    });

    // Readd when jsdom has support for navigate events
    // test('should track div click if it causes a navigation (popstate) change', async () => {
    //   await plugin?.setup(config as BrowserConfig, instance);

    //   // Set initial window location
    //   window.location.href = 'https://www.test.com/query';

    //   // trigger click event on div which is acting as a button
    //   document.getElementById('go-back-button')?.dispatchEvent(new Event('click'));
    //   await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));

    //   expect(track).toHaveBeenCalledTimes(1);
    //   expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {});
    // });
  });
});
