import { BrowserClient, PluginType, Event, EnrichmentPlugin } from '@amplitude/analytics-types';
import { BrowserConfig } from '../config';

export const visualTracking = (): EnrichmentPlugin => {
  const name = '@amplitude/plugin-visual-tracking-browser';
  const type = PluginType.ENRICHMENT;
  const setup = async (config: BrowserConfig, amplitude?: BrowserClient) => {
    /* istanbul ignore if */
    if (!amplitude) {
      // TODO: Add required minimum version of @amplitude/analytics-browser
      config.loggerProvider.warn(
        'Visual tracking requires a later version of @amplitude/analytics-browser. Visual tracking events are not tracked.',
      );
      return;
    }

    if (!config.visualTracking?.tags) {
      config.loggerProvider.warn('No visual tracking tags provided.');
      return;
    }

    const tags = config.visualTracking?.tags;

    const addListener = (el: Element) => {
      el.addEventListener('click', () => {
        for (const tag of tags) {
          // eslint-disable-next-line no-restricted-globals
          if (
            tag.action === 'click' &&
            window.location.href.startsWith(tag.page) &&
            tag.element &&
            el.matches(tag.element)
          ) {
            amplitude.track(`[VisualTag] ${tag.name}`, {
              action: tag.action,
              page: tag.page,
              element: tag.element,
            });
          }
        }
      });

      el.addEventListener('change', () => {
        for (const tag of tags) {
          // eslint-disable-next-line no-restricted-globals
          if (
            tag.action === 'change' &&
            window.location.href.startsWith(tag.page) &&
            tag.element &&
            el.matches(tag.element)
          ) {
            amplitude.track(`[VisualTag] ${tag.name}`, {
              action: tag.action,
              page: tag.page,
              element: tag.element,
            });
          }
        }
      });
    };

    // Adds listener to all the elements
    const allElements = Array.from(document.body.getElementsByTagName('*'));
    allElements.forEach(addListener);

    // Adds listener to elements added after initial load
    /* istanbul ignore else */
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            addListener(node as HTMLFormElement);
            if ('getElementsByTagName' in node && typeof node.getElementsByTagName === 'function') {
              Array.from(node.getElementsByTagName('*') as Element[]).map(addListener);
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
