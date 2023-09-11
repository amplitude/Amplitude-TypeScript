import { EnrichmentPlugin, Event } from '@amplitude/analytics-types';
import { GlobalUserPropertiesPlugin, Options } from './typings/global-user-properties';
import { isNotSpecialAmplitudeEvent } from 'src/helpers';


export const globalUserPropertiesPlugin: GlobalUserPropertiesPlugin = function (options: Options = {}) {
  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-global-user-properties',
    type: 'enrichment',

    setup: async () => {},

    /* Note: The promise is because of the interface, not because this has any asynchronous behavior */
    execute: async (event: Event): Promise<Event> => {
      // Skip amplitude special events
      if (isNotSpecialAmplitudeEvent(event)) {
        event.global_user_properties = event.user_properties;

        if (!options.shouldKeepOriginalUserProperties) {
          delete event.global_user_properties;
        }      
      };

      return event;
    },
  };

  return plugin;
};
