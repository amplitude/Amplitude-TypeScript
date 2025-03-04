import { createInstance } from '@amplitude/analytics-browser';
import { EnrichmentPlugin } from '@amplitude/analytics-types';

/**
 * This is an example plugin that enriches events with event_type "Page View" by adding
 * more event_properties on top of what @amplitude/analytics-browser provides out of the box
 *
 * @returns EnrichmentPlugin
 */
export const pageViewTrackingEnrichment = (): EnrichmentPlugin => {
  return {
    name: 'page-view-tracking-enrichment',
    type: 'enrichment',
    setup: async () => undefined,
    execute: async (event) => {
      if (event.event_type !== '[Amplitude] Page Viewed') {  // event name format if using Autocapture Pageviews 
        return event;
      }
      event.event_properties = {
        ...event.event_properties,
        // TODO: Add new event properties here
        new_property: 'new_value',
      };
      return event;
    },
  };
};

const instance = createInstance();

/**
 * IMPORTANT: install plugin before calling init to make sure plugin is added by the time
 * init function sends out the "Page View" event
 */
instance.add(pageViewTrackingEnrichment());

// initialize sdk
instance.init('API_KEY');
