import { BrowserClient, PluginType, Event, EnrichmentPlugin } from '@amplitude/analytics-types';
import { DEFAULT_LINK_CLICKED_EVENT, LINK_CLASSES, LINK_DOMAIN, LINK_ID, LINK_URL } from '../constants';
import { BrowserConfig } from '../config';

export const clickTracking = (): EnrichmentPlugin => {
  const name = '@amplitude/plugin-click-tracking-browser';
  const type = PluginType.ENRICHMENT;
  const setup = async (config: BrowserConfig, amplitude?: BrowserClient) => {
    /* istanbul ignore if */
    if (!amplitude) {
      config.loggerProvider.warn(
        'Click tracking requires @amplitude/analytics-browser >= 1.9.1. Click events are not tracked.',
      );
      return;
    }

    const addClickListener = (a: HTMLAnchorElement) => {
      let url: URL;
      try {
        // eslint-disable-next-line no-restricted-globals
        url = new URL(a.href, window.location.href);
      } catch {
        /* istanbul ignore next */
        return;
      }
      a.addEventListener('click', () => {
        amplitude.track(DEFAULT_LINK_CLICKED_EVENT, {
          [LINK_CLASSES]: a.className.length > 0 ? a.className.split(' ') : '',
          [LINK_DOMAIN]: url.hostname,
          [LINK_ID]: a.id,
          [LINK_URL]: a.href,
        });
      });
    };

    // Adds listener to existing anchor tags
    const links = Array.from(document.getElementsByTagName('a'));
    links.forEach(addClickListener);

    // Adds listener to anchor tags added after initial load
    /* istanbul ignore else */
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'A') {
              addClickListener(node as HTMLAnchorElement);
            }
            if ('querySelectorAll' in node && typeof node.querySelectorAll === 'function') {
              Array.from(node.querySelectorAll('a') as HTMLAnchorElement[]).map(addClickListener);
            }
          });
        });
      });

      observer.observe(document.body, {
        subtree: true,
        childList: true,
      });
    }
  };
  const execute = async (event: Event) => event;

  return {
    name,
    type,
    setup,
    execute,
  };
};
