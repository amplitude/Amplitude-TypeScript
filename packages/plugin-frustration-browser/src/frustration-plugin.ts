/* eslint-disable no-restricted-globals */
import { BrowserClient, BrowserConfig, EnrichmentPlugin, getGlobalScope } from '@amplitude/analytics-core';
import { PLUGIN_NAME, RAGE_CLICK_EVENT_NAME } from './constants';
import * as rageClick from './rage-click';
import { RageClickEventPayload } from './types';

export type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

export const frustrationPlugin = (): BrowserEnrichmentPlugin => {
  let clickHandler: ((event: MouseEvent) => void) | null = null;

  const setup: BrowserEnrichmentPlugin['setup'] = async (_, amplitude) => {
    const { document } = getGlobalScope() as typeof globalThis;
    rageClick.init({
      timeout: 3000, // TODO: make this configurable
      threshold: 3, // TODO: make this configurable
      ignoreSelector: '#ignore-rage-click', // TODO: make this configurable
      onRageClick(clickEvent, element) {
        const payload: RageClickEventPayload = {
          '[Amplitude] Begin Time': clickEvent.begin,
          '[Amplitude] End Time': clickEvent.end!,
          '[Amplitude] Duration': clickEvent.end! - clickEvent.begin,
          '[Amplitude] Element Text': element.innerText || element.textContent || '',
          '[Amplitude] Element Tag': element.tagName.toLowerCase(),
          '[Amplitude] Clicks': clickEvent.clicks,
        };
        amplitude.track(RAGE_CLICK_EVENT_NAME, payload);
      },
    });

    document.addEventListener(
      'click',
      (clickHandler = (event: MouseEvent) => {
        const { target: clickedEl } = event;
        if (clickedEl instanceof HTMLElement) {
          rageClick.registerClick(clickedEl, event);
        }
      }),
    );
  };

  /* istanbul ignore next */
  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    const { document } = getGlobalScope() as typeof globalThis;
    if (clickHandler) {
      document.removeEventListener('click', clickHandler);
      clickHandler = null;
    }
    rageClick.clear();
  };

  return {
    name: PLUGIN_NAME,
    type: 'enrichment',
    setup,
    execute,
    teardown,
  };
};
