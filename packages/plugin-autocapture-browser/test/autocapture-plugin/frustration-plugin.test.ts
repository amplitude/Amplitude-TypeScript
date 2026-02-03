import { AllWindowObservables, frustrationPlugin } from '../../src/frustration-plugin';
import { BrowserConfig, EnrichmentPlugin, ILogger, Observable, Unsubscribable } from '@amplitude/analytics-core';
import { createMockBrowserClient } from '../mock-browser-client';
import { trackDeadClick } from '../../src/autocapture/track-dead-click';
import { trackRageClicks } from '../../src/autocapture/track-rage-click';
import { trackErrorClicks } from '../../src/autocapture/track-error-click';
import { BrowserErrorEvent, createErrorObservable } from '../../src/observables';
import { dispatchUnhandledRejection } from '../utils';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/unbound-method */

// Mock the tracking functions
jest.mock('../../src/autocapture/track-dead-click', () => ({
  trackDeadClick: jest.fn(),
}));

jest.mock('../../src/autocapture/track-rage-click', () => ({
  trackRageClicks: jest.fn(),
}));

jest.mock('../../src/autocapture/track-error-click', () => ({
  trackErrorClicks: jest.fn(),
}));

describe('frustrationPlugin', () => {
  let plugin: EnrichmentPlugin | undefined;
  let instance: any;

  const loggerProvider: Partial<ILogger> = {
    log: jest.fn(),
    warn: jest.fn(),
  };

  const config: Partial<BrowserConfig> = {
    defaultTracking: false,
    loggerProvider: loggerProvider as ILogger,
  };

  beforeEach(() => {
    // mock window.navigation
    (window.navigation as any) = {
      _handlers: [],
      addEventListener: function (type: string, listener: () => void) {
        if (type === 'navigate') {
          this._handlers.push(listener);
        }
      },
      removeEventListener: function (type: string, listener: () => void) {
        if (type === 'navigate') {
          this._handlers = this._handlers.filter((l: () => void) => l !== listener);
        }
      },
      dispatchEvent: function (event: Event) {
        if (event.type === 'navigate') {
          this._handlers.forEach((handler: () => void) => handler());
        }
      },
    };

    instance = createMockBrowserClient();

    // mock window.PointerEvent because it's not available in jsdom
    function MockPointerEvent(type: string, init: PointerEventInit) {
      return new Event(type, init);
    }
    (global.window as any).PointerEvent = MockPointerEvent;
    (global.window as any).PointerEvent.prototype = Event.prototype;
    jest.clearAllMocks();
  });

  describe('enable/disable frustration interactions', () => {
    it('should skip tracking when set to false', async () => {
      plugin = frustrationPlugin({
        deadClicks: false,
        rageClicks: false,
      });

      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(trackDeadClick).not.toHaveBeenCalled();
      expect(trackRageClicks).not.toHaveBeenCalled();
    });

    it('should enable tracking when set to true', async () => {
      plugin = frustrationPlugin({
        deadClicks: true,
        rageClicks: true,
      });

      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(trackDeadClick).toHaveBeenCalled();
      expect(trackRageClicks).toHaveBeenCalled();
    });

    it('should enable tracking when not defined', async () => {
      plugin = frustrationPlugin({});

      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(trackDeadClick).toHaveBeenCalled();
      expect(trackRageClicks).toHaveBeenCalled();
    });

    it('should be disabled when set to null', async () => {
      plugin = frustrationPlugin({
        deadClicks: null as any,
        rageClicks: null as any,
      });

      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(trackDeadClick).not.toHaveBeenCalled();
      expect(trackRageClicks).not.toHaveBeenCalled();
    });
  });

  describe('css selector allowlists', () => {
    it('should pass custom dead click allowlist to tracking function', async () => {
      const customDeadClickAllowlist = ['button', 'a'];

      plugin = frustrationPlugin({
        deadClicks: {
          cssSelectorAllowlist: customDeadClickAllowlist,
        },
      });

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Verify that trackDeadClick was called with the custom allowlist
      expect(trackDeadClick).toHaveBeenCalledWith(
        expect.objectContaining({
          shouldTrackDeadClick: expect.any(Function),
        }),
      );

      // Get the shouldTrackDeadClick function that was passed
      const deadClickCall = (trackDeadClick as jest.Mock).mock.calls[0][0];
      const shouldTrackDeadClick = deadClickCall.shouldTrackDeadClick;

      // Create test elements
      const button = document.createElement('button');
      const div = document.createElement('div');

      // Test that the allowlist is working
      expect(shouldTrackDeadClick('click', button)).toBe(true); // button is in allowlist
      expect(shouldTrackDeadClick('click', div)).toBe(false); // div is not in allowlist
    });

    it('should pass custom rage click allowlist to tracking function', async () => {
      const customRageClickAllowlist = ['input', 'select'];

      plugin = frustrationPlugin({
        rageClicks: {
          cssSelectorAllowlist: customRageClickAllowlist,
        },
      });

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Verify that trackRageClicks was called with the custom allowlist
      expect(trackRageClicks).toHaveBeenCalledWith(
        expect.objectContaining({
          shouldTrackRageClick: expect.any(Function),
        }),
      );

      // Get the shouldTrackRageClick function that was passed
      const rageClickCall = (trackRageClicks as jest.Mock).mock.calls[0][0];
      const shouldTrackRageClick = rageClickCall.shouldTrackRageClick;

      // Create test elements
      const input = document.createElement('input');
      const span = document.createElement('span');

      // Test that the allowlist is working
      expect(shouldTrackRageClick('click', input)).toBe(true); // input is in allowlist
      expect(shouldTrackRageClick('click', span)).toBe(false); // span is not in allowlist
    });

    it('should pass custom error click allowlist to tracking function', async () => {
      const customErrorClickAllowlist = ['input', 'select'];

      plugin = frustrationPlugin({
        errorClicks: {
          cssSelectorAllowlist: customErrorClickAllowlist,
        },
      });

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Get the shouldTrackErrorClick function that was passed
      const errorClickCall = (trackErrorClicks as jest.Mock).mock.calls[0][0];
      const shouldTrackErrorClick = errorClickCall.shouldTrackErrorClick;

      // Create test elements
      const input = document.createElement('input');
      const span = document.createElement('span');

      // Test that the allowlist is working
      expect(shouldTrackErrorClick('click', input)).toBe(true); // input is in allowlist
      expect(shouldTrackErrorClick('click', span)).toBe(false); // span is not in allowlist
    });
  });

  describe('errorClicks', () => {
    it('should not track error clicks if not explicitly enabled (while still @experimental)', async () => {
      plugin = frustrationPlugin({});
      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(trackErrorClicks).not.toHaveBeenCalled();
    });

    it('should track error clicks if explicitly enabled', async () => {
      plugin = frustrationPlugin({
        errorClicks: true,
      });
      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(trackErrorClicks).toHaveBeenCalled();
    });
  });

  describe('plugin lifecycle', () => {
    it('should initialize with default options', () => {
      plugin = frustrationPlugin();
      expect(plugin.name).toBe('@amplitude/plugin-frustration-browser');
      expect(plugin.type).toBe('enrichment');
    });

    it('should initialize with correct name and type', () => {
      plugin = frustrationPlugin({});
      expect(plugin.name).toBe('@amplitude/plugin-frustration-browser');
      expect(plugin.type).toBe('enrichment');
    });

    it('should setup tracking functions with default options', async () => {
      plugin = frustrationPlugin({});
      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(trackDeadClick).toHaveBeenCalledWith(
        expect.objectContaining({
          amplitude: instance,
          allObservables: expect.any(Object),
          getEventProperties: expect.any(Function),
          shouldTrackDeadClick: expect.any(Function),
        }),
      );

      // Test getEventProperties function
      const deadClickCall = (trackDeadClick as jest.Mock).mock.calls[0][0];
      const getEventProperties = deadClickCall.getEventProperties;

      // Create test element with data attributes
      const testElement = document.createElement('button');
      testElement.setAttribute('data-amplitude-click', 'test-click');
      testElement.setAttribute('data-amplitude-custom', 'custom-value');
      testElement.setAttribute('data-other', 'ignored');

      // Test getEventProperties with different action types
      const props = getEventProperties('click', testElement);
      expect(props).toBeDefined();
    });

    it('should use custom dataAttributePrefix when provided', async () => {
      const customDataAttributePrefix = 'data-custom-';

      plugin = frustrationPlugin({
        dataAttributePrefix: customDataAttributePrefix,
      });
      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(trackDeadClick).toHaveBeenCalledWith(
        expect.objectContaining({
          amplitude: instance,
          allObservables: expect.any(Object),
          getEventProperties: expect.any(Function),
          shouldTrackDeadClick: expect.any(Function),
        }),
      );

      // Test getEventProperties function with custom prefix
      const deadClickCall = (trackDeadClick as jest.Mock).mock.calls[0][0];
      const getEventProperties = deadClickCall.getEventProperties;

      // Create test element with custom data attributes
      const testElement = document.createElement('button');
      testElement.setAttribute('data-custom-click', 'custom-click-value');
      testElement.setAttribute('data-custom-user', 'custom-user-value');
      testElement.setAttribute('data-amplitude-ignored', 'should-be-ignored');
      testElement.setAttribute('data-other', 'also-ignored');

      // Test getEventProperties with custom prefix
      const props = getEventProperties('click', testElement);
      expect(props).toBeDefined();

      // Verify that only attributes with the custom prefix are captured
      expect(props['[Amplitude] Element Attributes']).toEqual({
        click: 'custom-click-value',
        user: 'custom-user-value',
      });

      // Verify that attributes with other prefixes are not captured
      expect(props['[Amplitude] Element Attributes']).not.toHaveProperty('amplitude-ignored');
      expect(props['[Amplitude] Element Attributes']).not.toHaveProperty('other');
    });

    it('should unsubscribe from all subscriptions on teardown', async () => {
      const mockSubscription = {
        unsubscribe: jest.fn(),
      };

      // Mock the tracking functions to return subscriptions
      (trackDeadClick as jest.Mock).mockReturnValue(mockSubscription);
      (trackRageClicks as jest.Mock).mockReturnValue(mockSubscription);

      plugin = frustrationPlugin({});
      await plugin?.setup?.(config as BrowserConfig, instance);
      await plugin?.teardown?.();

      expect(mockSubscription.unsubscribe).toHaveBeenCalledTimes(2);
    });

    it('should execute and return the event unchanged', async () => {
      plugin = frustrationPlugin({});

      const mockEvent = {
        event_type: 'test_event',
        event_properties: { test: 'value' },
        user_properties: { user: 'data' },
      };

      const result = await plugin?.execute?.(mockEvent);

      expect(result).toBe(mockEvent);
      expect(result).toEqual(mockEvent);
    });
  });

  describe('observables', () => {
    it('should create click + mutation observables with correct properties', async () => {
      plugin = frustrationPlugin({});
      await plugin?.setup?.(config as BrowserConfig, instance);

      const rageClickCall = (trackRageClicks as jest.Mock).mock.calls[0][0];
      const observables = rageClickCall.allObservables;

      expect(observables).toHaveProperty('clickObservable');
      expect(observables).toHaveProperty('mutationObservable');
      expect(observables).toHaveProperty('navigateObservable');

      // Test click observable
      const clickSpy = jest.fn();
      const subscription = observables.clickObservable.subscribe(clickSpy);

      // Create and trigger a mock click event
      const testElement = document.createElement('button');
      testElement.setAttribute('data-amplitude-click', 'test-click');
      document.body.appendChild(testElement);

      const mockPointerDownEvent = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      testElement.dispatchEvent(mockPointerDownEvent);

      // Verify click was captured
      expect(clickSpy).toHaveBeenCalled();

      // Cleanup
      subscription.unsubscribe();
      document.body.removeChild(testElement);

      // Test mutation observable
      const mutationSpy = jest.fn();
      const mutationSubscription = observables.mutationObservable.subscribe(mutationSpy);

      // Create and trigger a mutation
      const container = document.createElement('div');
      container.setAttribute('data-amplitude-mutation', 'test-mutation');
      document.body.appendChild(container);

      // Add a new element to trigger mutation
      const newElement = document.createElement('span');
      newElement.textContent = 'Test Mutation';
      container.appendChild(newElement);

      // Wait for the next tick to allow mutation observer to process
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify mutation was captured
      expect(mutationSpy).toHaveBeenCalled();

      // Cleanup
      mutationSubscription.unsubscribe();
      document.body.removeChild(container);
    });

    it('should create navigate observable', async () => {
      plugin = frustrationPlugin({});
      await plugin?.setup?.(config as BrowserConfig, instance);
      const rageClickCall = (trackRageClicks as jest.Mock).mock.calls[0][0];
      const observables = rageClickCall.allObservables;

      expect(observables).toHaveProperty('navigateObservable');

      // Create and trigger a mock navigate event
      const navigateSpy = jest.fn();
      const subscription = observables.navigateObservable.subscribe(navigateSpy);

      // Trigger a mock navigate event
      (window.navigation as any).dispatchEvent(new Event('navigate'));

      // Verify that the navigate event was captured
      expect(navigateSpy).toHaveBeenCalled();

      // Cleanup
      subscription.unsubscribe();

      // expect no event listeners left on window.navigation
      expect((window.navigation as any)._handlers.length).toBe(0);
    });

    it('should create browser error observable with type and timestamp', async () => {
      plugin = frustrationPlugin({
        errorClicks: true,
      });
      await plugin?.setup?.(config as BrowserConfig, instance);

      const errorClickCall = (trackErrorClicks as jest.Mock).mock.calls[0][0];
      const observables = errorClickCall.allObservables;

      expect(observables).toHaveProperty('browserErrorObservable');

      // Subscribe to the browser error observable
      const errorSpy = jest.fn();
      const subscription = observables.browserErrorObservable.subscribe(errorSpy);

      // Trigger a console error
      window.console.error('test browser error observable');

      // Verify the error was captured and enriched with type and timestamp
      expect(errorSpy).toHaveBeenCalled();
      const capturedError = errorSpy.mock.calls[0][0];

      // Verify the structure added by dataExtractor.addTypeAndTimestamp
      expect(capturedError).toHaveProperty('type', 'error');
      expect(capturedError).toHaveProperty('timestamp');
      expect(typeof capturedError.timestamp).toBe('number');
      expect(capturedError).toHaveProperty('event');
      expect(capturedError.event).toEqual({
        kind: 'console',
        message: 'test browser error observable',
      });

      // Cleanup
      subscription.unsubscribe();
    });

    describe('selection observable', () => {
      let plugin: EnrichmentPlugin | undefined;
      let rageClickCall: any;
      let observables: AllWindowObservables;
      let subscription: Unsubscribable | undefined;
      let selectionSpy: jest.Mock;

      beforeEach(async () => {
        plugin = frustrationPlugin({});
        await plugin?.setup?.(config as BrowserConfig, instance);
        rageClickCall = (trackRageClicks as jest.Mock).mock.calls[0][0];
        observables = rageClickCall.allObservables;
        selectionSpy = jest.fn();
        subscription = observables.selectionObservable?.subscribe(selectionSpy);
        jest.clearAllMocks();
      });

      afterEach(() => {
        subscription?.unsubscribe();
      });

      it('should trigger on selection highlighted', async () => {
        const div = document.createElement('div');
        div.focus();

        expect(observables).toHaveProperty('selectionObservable');

        jest.spyOn(window, 'getSelection').mockReturnValue({
          isCollapsed: false,
        } as any);
        const mockSelectionEvent: any = new Event('selectionchange');
        (window.document as any).dispatchEvent(mockSelectionEvent);

        expect(selectionSpy).toHaveBeenCalled();
      });

      it('should not trigger on non-input element selection change if selection is collapsed', async () => {
        // Trigger a mock selection event
        const div = document.createElement('div');
        div.focus();
        (window.document as any).dispatchEvent(new Event('selectionchange'));
        expect(selectionSpy).not.toHaveBeenCalled();
      });

      it('should trigger on input element selection change', async () => {
        // Trigger a mock selection event
        ['textarea', 'input'].forEach((tag) => {
          const input = document.createElement(tag) as HTMLTextAreaElement | HTMLInputElement;
          input.value = 'some text here'; // Add text so there's something to select
          input.selectionStart = 0;
          input.selectionEnd = 10;
          document.body.appendChild(input);
          input.focus(); // This sets document.activeElement to the input
          (window.document as any).dispatchEvent(new Event('selectionchange'));
          document.body.removeChild(input);
        });

        expect(selectionSpy).toHaveBeenCalledTimes(2);
      });

      it('should not trigger on input element selection change if selection is collapsed', async () => {
        // Trigger a mock selection event on input and textarea elements
        ['textarea', 'input'].forEach((tag) => {
          const input = document.createElement(tag) as HTMLTextAreaElement | HTMLInputElement;
          input.value = 'some text here'; // Add text so there's something to select
          input.selectionStart = 0;
          input.selectionEnd = 0;
          document.body.appendChild(input);
          input.focus(); // This sets document.activeElement to the input
          (window.document as any).dispatchEvent(new Event('selectionchange'));
          document.body.removeChild(input);
        });

        expect(selectionSpy).not.toHaveBeenCalled();
      });

      it('should not trigger on input element that does not support selectionStart/selectionEnd (like checkbox)', async () => {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        // make .selectionStart and .selectionEnd throw an error
        // simulating "Chrome" behavior
        Object.defineProperty(checkbox, 'selectionStart', {
          get: () => {
            throw new Error('Not supported');
          },
        });
        Object.defineProperty(checkbox, 'selectionEnd', {
          get: () => {
            throw new Error('Not supported');
          },
        });
        document.body.appendChild(checkbox);
        checkbox.focus(); // This sets document.activeElement to the checkbox
        (window.document as any).dispatchEvent(new Event('selectionchange'));
        document.body.removeChild(checkbox);
        expect(selectionSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('createBrowserErrorObservable', () => {
    let errorObservable: Observable<BrowserErrorEvent>;
    let subscribePromise: Promise<BrowserErrorEvent>;
    let subscription: Unsubscribable;

    beforeEach(() => {
      errorObservable = createErrorObservable();
      subscribePromise = new Promise((resolve) => {
        subscription = errorObservable.subscribe((error: BrowserErrorEvent) => {
          resolve(error);
        });
      });
    });

    afterEach(() => {
      subscription.unsubscribe();
    });

    it('should capture unhandled rejections', async () => {
      const error = new Error('boom');
      dispatchUnhandledRejection(window, error);

      const res = await subscribePromise;
      expect(res.kind).toBe('unhandledrejection');
      expect(res.message).toBe('boom');
    });

    it('should capture unhandled rejections with non-object reason', async () => {
      const error = 'Something went wrong';
      dispatchUnhandledRejection(window, error);

      const res = await subscribePromise;
      expect(res.kind).toBe('unhandledrejection');
      expect(res.message).toBe('Something went wrong');
    });

    it('should capture uncaught errors', async () => {
      setTimeout(() => {
        const error = new Error('test uncaught error');
        error.stack = 'fake stack';
        throw error;
      }, 10);
      const res = await subscribePromise;
      expect(res.stack).toEqual('fake stack');
      expect(res.kind).toBe('error');
      expect(res.message).toBe('test uncaught error');
    });

    it('should capture uncaught errors with non-object error', async () => {
      setTimeout(() => {
        throw 'test uncaught error';
      }, 10);
      const res = await subscribePromise;
      expect(res.kind).toBe('error');
      expect(res.message).toBe('test uncaught error');
      expect(res.stack).toBeUndefined();
    });

    it('should capture console errors', async () => {
      window.console.error('test console error');
      const res = await subscribePromise;
      expect(res).toEqual({
        kind: 'console',
        message: 'test console error',
      });
    });
  });
});
