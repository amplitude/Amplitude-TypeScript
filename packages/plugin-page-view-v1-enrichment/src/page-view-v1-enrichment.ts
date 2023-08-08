import { BrowserConfig, EnrichmentPlugin, Event } from '@amplitude/analytics-types';
import { CreatePageViewV1EnrichmentPlugin } from './typings/page-view-v1-enrichment-plugin';

export const pageViewV1EnrichmentPlugin: CreatePageViewV1EnrichmentPlugin = function () {
  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-page-view-v1-enrichment-browser',
    type: 'enrichment',

    setup: async function (config: BrowserConfig) {
      config.loggerProvider.log('Installing @amplitude/plugin-page-view-v1-enrichment-browser.');
    },

    execute: async (event: Event) => {
      if (event.event_type == '[Amplitude] Page Viewed') {
        const {
          '[Amplitude] Page Domain': page_domain,
          '[Amplitude] Page Location': page_location,
          '[Amplitude] Page Path': page_path,
          '[Amplitude] Page Title': page_title,
          '[Amplitude] Page URL': page_url,
        } = event.event_properties || {};

        event = {
          ...event,
          event_type: 'Page View',
          event_properties: {
            ...event.event_properties,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            page_domain: page_domain ?? '',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            page_location: page_location ?? '',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            page_path: page_path ?? '',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            page_title: page_title ?? '',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            page_url: page_url ?? '',
          },
        };

        delete event.event_properties?.['[Amplitude] Page Domain'];
        delete event.event_properties?.['[Amplitude] Page Location'];
        delete event.event_properties?.['[Amplitude] Page Path'];
        delete event.event_properties?.['[Amplitude] Page Title'];
        delete event.event_properties?.['[Amplitude] Page URL'];
      }
      return event;
    },
  };

  return plugin;
};
