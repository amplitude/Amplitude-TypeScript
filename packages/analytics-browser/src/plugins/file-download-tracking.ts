import { BrowserClient, PluginType, Event, EnrichmentPlugin } from '@amplitude/analytics-types';
import { BrowserConfig } from '../config';

const FILE_DOWNLOAD_EVENT = '[Amplitude] File Download';

export const fileDownloadTracking = (): EnrichmentPlugin => {
  const name = '@amplitude/plugin-file-download-tracking-browser';
  const type = PluginType.ENRICHMENT;
  const setup = async (config: BrowserConfig, amplitude?: BrowserClient) => {
    /* istanbul ignore if */
    if (!amplitude) {
      // TODO: Add required minimum version of @amplitude/analytics-browser
      config.loggerProvider.warn(
        'File download tracking requires a later version of @amplitude/analytics-browser. File download events are not tracked.',
      );
      return;
    }

    const addFileDownloadListener = (a: HTMLAnchorElement) => {
      try {
        const url = new URL(a.href);
        const result = ext.exec(url.href);
        const fileExtension = result?.[1];

        if (fileExtension) {
          a.addEventListener('click', () => {
            if (fileExtension) {
              amplitude.track(FILE_DOWNLOAD_EVENT, {
                file_extension: fileExtension,
                file_name: url.pathname,
                link_id: a.id,
                link_text: a.text,
                link_url: a.href,
              });
            }
          });
        }
      } catch {
        config.loggerProvider.error(`Something went wrong. File download events are not tracked for a#{a.id}`);
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
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'A') {
              addFileDownloadListener(node as HTMLAnchorElement);
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
