/* eslint-disable @typescript-eslint/unbound-method */
import { BrowserConfig, EnrichmentPlugin } from '@amplitude/analytics-core';
import { frustrationPlugin } from '../../src/frustration-plugin';
import { AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT, AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../../src/constants';
import { createMockBrowserClient } from '../mock-browser-client';

describe('frustrationPlugin click sources', () => {
  let plugin: EnrichmentPlugin | undefined;
  let instance: ReturnType<typeof createMockBrowserClient>;
  let link: HTMLAnchorElement;
  let originalNavigation: Window['navigation'];

  const config = {
    defaultTracking: false,
    loggerProvider: {
      debug: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
    },
  } as unknown as BrowserConfig;

  const setupPlugin = async ({ deadClicks, rageClicks }: { deadClicks: boolean; rageClicks: boolean }) => {
    plugin = frustrationPlugin({
      deadClicks,
      rageClicks,
      errorClicks: false,
      thrashedCursor: false,
    });
    await plugin.setup?.(config, instance);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    originalNavigation = window.navigation;
    (window as any).navigation = undefined;
    instance = createMockBrowserClient();
    document.body.innerHTML = '<a id="product-card" href="/product/1"><img alt="Product" /></a>';
    link = document.querySelector('#product-card') as HTMLAnchorElement;
    link.addEventListener('click', (event) => event.preventDefault());
  });

  afterEach(async () => {
    await plugin?.teardown?.();
    document.body.innerHTML = '';
    (window as any).navigation = originalNavigation;
    jest.useRealTimers();
  });

  it('does not classify a scroll gesture beginning on a link as a dead click', async () => {
    await setupPlugin({ deadClicks: true, rageClicks: false });

    link.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 50, clientY: 100 }),
    );
    link.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 50, clientY: 160 }));
    link.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }));
    window.dispatchEvent(new Event('scroll'));

    await jest.advanceTimersByTimeAsync(3_100);

    expect(instance.track).not.toHaveBeenCalled();
  });

  it('classifies a completed click with no resulting change as a dead click', async () => {
    await setupPlugin({ deadClicks: true, rageClicks: false });

    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, clientX: 50, clientY: 100 }),
    );
    await jest.advanceTimersByTimeAsync(3_100);

    expect(instance.track).toHaveBeenCalledWith(
      AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT,
      expect.objectContaining({
        '[Amplitude] Element Tag': 'a',
        '[Amplitude] X': 50,
        '[Amplitude] Y': 100,
      }),
      expect.any(Object),
    );
  });

  it('does not classify a completed click followed by a DOM mutation as dead', async () => {
    await setupPlugin({ deadClicks: true, rageClicks: false });
    link.addEventListener('click', () => link.setAttribute('data-selected', 'true'), { once: true });

    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, clientX: 50, clientY: 100 }),
    );
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(3_100);

    expect(instance.track).not.toHaveBeenCalled();
  });

  it('continues to classify rage interactions from pointerdown events', async () => {
    await setupPlugin({ deadClicks: false, rageClicks: true });

    for (let clickCount = 0; clickCount < 4; clickCount++) {
      link.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 50,
          clientY: 100,
        }),
      );
    }
    await jest.advanceTimersByTimeAsync(1_100);

    expect(instance.track).toHaveBeenCalledWith(
      AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
      expect.any(Object),
      expect.any(Object),
    );
  });
});
