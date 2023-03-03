/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BaseEvent, EnrichmentPlugin, PluginType } from '@amplitude/analytics-types';
import { DEFAULT_EVENT_PREFIX, DEFAULT_PAGE_VIEW_EVENT } from '../constants';

interface PageViewEventProperties extends Record<string, string | undefined> {
  page_domain: string;
  page_location: string;
  page_path: string;
  page_title: string;
  page_url: string;
}

const eventPropertyMap: PageViewEventProperties = {
  page_domain: `${DEFAULT_EVENT_PREFIX} Page Domain`,
  page_location: `${DEFAULT_EVENT_PREFIX} Page Location`,
  page_path: `${DEFAULT_EVENT_PREFIX} Page Path`,
  page_title: `${DEFAULT_EVENT_PREFIX} Page Title`,
  page_url: `${DEFAULT_EVENT_PREFIX} Page URL`,
};

export const defaultPageViewEventEnrichment = (): EnrichmentPlugin => {
  const name = '@amplitude/plugin-default-page-view-event-enrichment-browser';
  const type = PluginType.ENRICHMENT;
  const setup = async () => undefined;
  const execute = async (event: BaseEvent) => {
    if (event.event_type === DEFAULT_PAGE_VIEW_EVENT && event.event_properties) {
      event.event_properties = Object.entries(event.event_properties).reduce<{
        [key: string]: any;
      }>((acc, [key, value]) => {
        const transformedPropertyName = eventPropertyMap[key];
        if (transformedPropertyName) {
          acc[transformedPropertyName] = value;
        } else {
          acc[key] = value;
        }
        return acc;
      }, {});
    }
    return event;
  };

  return {
    name,
    type,
    setup,
    execute,
  };
};
