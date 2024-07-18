import { autocapturePlugin } from '../../src/autocapture-plugin';
import { BrowserConfig, EnrichmentPlugin, Logger } from '@amplitude/analytics-types';
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

    const loggerProvider: Partial<Logger> = {
      log: jest.fn(),
      warn: jest.fn(),
    };
    const config: Partial<BrowserConfig> = {
      defaultTracking: false,
      loggerProvider: loggerProvider as Logger,
    };

    beforeEach(async () => {
      plugin = autocapturePlugin({ debounceTime: TESTING_DEBOUNCE_TIME });
      instance = createInstance();
      await instance.init(API_KEY, USER_ID).promise;
      track = jest.spyOn(instance, 'track');

      const content = `
        <div id="main" className="class1 class2" data-test-attr="test-attr">
          <div id="inner-left" className="column">
            <div id="addDivButton">Add div</div>
            <div id="go-back-button">Go Back</div>
            <button id="real-button">Click me</button>
            <div class="red" id="no-action-div">No action div</div>
          </div>
          <div id="inner-right" className="column">
            <div className="card">
              <h1>Card Title</h1>
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
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger 2 click events on button
      const realButton = document.getElementById('real-button');
      realButton?.dispatchEvent(new Event('click'));
      realButton?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenCalledTimes(2);
    });

    test('should not track div click if it does not change the DOM or navigate', async () => {
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click event on div which is acting as a button
      document.getElementById('no-action-div')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));

      expect(track).toHaveBeenCalledTimes(0);
    });

    test('should track div click if it causes a DOM change', async () => {
      await plugin?.setup(config as BrowserConfig, instance);

      // trigger click event on div which is acting as a button
      document.getElementById('addDivButton')?.dispatchEvent(new Event('click'));
      document.getElementById('addDivButton')?.dispatchEvent(new Event('click'));
      document.getElementById('addDivButton')?.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 503));

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, '[Amplitude] Element Clicked', {
        '[Amplitude] Element Hierarchy': [
          {
            index: 1,
            indexOfType: 0,
            prevSib: 'head',
            tag: 'body',
          },
          {
            attrs: {
              classname: 'class1 class2',
              'data-test-attr': 'test-attr',
            },
            id: 'main',
            index: 0,
            indexOfType: 0,
            tag: 'div',
          },
          {
            attrs: {
              classname: 'column',
            },
            id: 'inner-left',
            index: 0,
            indexOfType: 0,
            tag: 'div',
          },
          {
            id: 'addDivButton',
            index: 0,
            indexOfType: 0,
            tag: 'div',
          },
        ],
        '[Amplitude] Element ID': 'addDivButton',
        '[Amplitude] Element Parent Label': 'Card Title',
        '[Amplitude] Element Position Left': 0,
        '[Amplitude] Element Position Top': 0,
        '[Amplitude] Element Selector': '#addDivButton',
        '[Amplitude] Element Tag': 'div',
        '[Amplitude] Element Text': 'Add div',
        '[Amplitude] Viewport Height': 768,
        '[Amplitude] Viewport Width': 1024,
      });
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
