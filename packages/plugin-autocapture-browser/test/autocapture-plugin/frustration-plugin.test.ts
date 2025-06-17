import { frustrationPlugin } from '../../src/frustration-plugin';
import { BrowserConfig, EnrichmentPlugin, ILogger } from '@amplitude/analytics-core';
import { createMockBrowserClient } from '../mock-browser-client';
import { trackDeadClick } from '../../src/autocapture/track-dead-click';
import { trackRageClicks } from '../../src/autocapture/track-rage-click';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/unbound-method */

// Mock the tracking functions
jest.mock('../../src/autocapture/track-dead-click', () => ({
  trackDeadClick: jest.fn(),
  _overrideDeadClickConfig: jest.fn(),
}));

jest.mock('../../src/autocapture/track-rage-click', () => ({
  trackRageClicks: jest.fn(),
  _overrideRageClickConfig: jest.fn(),
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
    instance = createMockBrowserClient();
    jest.clearAllMocks();
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
  });

  describe('plugin lifecycle', () => {
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
      expect(observables).toHaveProperty('changeObservable');

      // Test click observable
      const clickSpy = jest.fn();
      const subscription = observables.clickObservable.subscribe(clickSpy);

      // Create and trigger a mock click event
      const testElement = document.createElement('button');
      testElement.setAttribute('data-amplitude-click', 'test-click');
      document.body.appendChild(testElement);

      const mockClickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      testElement.dispatchEvent(mockClickEvent);

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
  });
});
