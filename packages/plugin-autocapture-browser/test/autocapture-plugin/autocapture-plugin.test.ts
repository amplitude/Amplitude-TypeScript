import { autocapturePlugin } from '../../src/autocapture-plugin';
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

describe('autocapturePlugin', () => {
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

      plugin = autocapturePlugin(
        {},
        {
          deadClicks: {
            cssSelectorAllowlist: customDeadClickAllowlist,
          },
        },
      );

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

      plugin = autocapturePlugin(
        {},
        {
          rageClicks: {
            cssSelectorAllowlist: customRageClickAllowlist,
          },
        },
      );

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
});
