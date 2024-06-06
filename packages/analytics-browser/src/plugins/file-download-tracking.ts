import { BrowserClient, Event, EnrichmentPlugin } from '@amplitude/analytics-types';
import { DEFAULT_FILE_DOWNLOAD_EVENT, FILE_EXTENSION, FILE_NAME, LINK_ID, LINK_TEXT, LINK_URL } from '../constants';
import { BrowserConfig } from '../config';
import { getGlobalScope } from '@amplitude/analytics-client-common';

interface EventListener {
  element: Element;
  type: 'click';
  handler: () => void;
}

export const fileDownloadTracking = (): EnrichmentPlugin => {
  let observer: MutationObserver | undefined;
  let eventListeners: EventListener[] = [];
  const addEventListener = (element: Element, type: 'click', handler: () => void) => {
    element.addEventListener(type, handler);
    eventListeners.push({
      element,
      type,
      handler,
    });
  };
  const removeClickListeners = () => {
    eventListeners.forEach(({ element, type, handler }) => {
      /* istanbul ignore next */
      element?.removeEventListener(type, handler);
    });
    eventListeners = [];
  };

  const name = '@amplitude/plugin-file-download-tracking-browser';
  const type = 'enrichment';
  const setup = async (config: BrowserConfig, amplitude: BrowserClient) => {
    // The form interaction plugin observes changes in the dom. For this to work correctly, the observer can only be setup
    // after the body is built. When Amplitud gets initialized in a script tag, the body tag is still unavailable. So register this
    // only after the window is loaded
    /* istanbul ignore next */
    getGlobalScope()?.addEventListener('load', function () {
      /* istanbul ignore if */
      if (!amplitude) {
        // TODO: Add required minimum version of @amplitude/analytics-browser
        config.loggerProvider.warn(
          'File download tracking requires a later version of @amplitude/analytics-browser. File download events are not tracked.',
        );
        return;
      }

      /* istanbul ignore if */
      if (typeof document === 'undefined') {
        return;
      }

      const addFileDownloadListener = (a: HTMLAnchorElement) => {
        let url: URL;
        try {
          // eslint-disable-next-line no-restricted-globals
          url = new URL(a.href, window.location.href);
        } catch {
          /* istanbul ignore next */
          return;
        }
        const result = ext.exec(url.href);
        const fileExtension = result?.[1];

        if (fileExtension) {
          addEventListener(a, 'click', () => {
            if (fileExtension) {
              amplitude.track(DEFAULT_FILE_DOWNLOAD_EVENT, {
                [FILE_EXTENSION]: fileExtension,
                [FILE_NAME]: url.pathname,
                [LINK_ID]: a.id,
                [LINK_TEXT]: a.text,
                [LINK_URL]: a.href,
              });
            }
          });
        }
      };

      const ext =
        /\.(pdf|xlsx?|docx?|txt|rtf|csv|exe|key|pp(s|t|tx)|7z|pkg|rar|gz|zip|avi|mov|mp4|mpe?g|wmv|midi?|mp3|wav|wma)$/;

      // Adds listener to existing anchor tags
      const links = Array.from(document.getElementsByTagName('a'));
      links.forEach(addFileDownloadListener);

      // Adds listener to anchor tags added after initial load
      /* istanbul ignore else */
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeName === 'A') {
                addFileDownloadListener(node as HTMLAnchorElement);
              }
              if ('querySelectorAll' in node && typeof node.querySelectorAll === 'function') {
                Array.from(node.querySelectorAll('a') as HTMLAnchorElement[]).map(addFileDownloadListener);
              }
            });
          });
        });

        observer.observe(document.body, {
          subtree: true,
          childList: true,
        });
      }
    });
  };
  const execute = async (event: Event) => event;
  const teardown = async () => {
    observer?.disconnect();
    removeClickListeners();
  };

  return {
    name,
    type,
    setup,
    execute,
    teardown,
  };
};
