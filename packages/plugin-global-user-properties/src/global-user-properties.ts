import { EnrichmentPlugin, Event } from '@amplitude/analytics-types';
import { GlobalUserPropertiesPlugin, Options } from './typings/global-user-properties';
import { isAmplitudeIdentifyEvent, isNotSpecialAmplitudeEvent } from './helpers';

export const globalUserPropertiesPlugin: GlobalUserPropertiesPlugin = function (options: Options = {}) {
  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-global-user-properties',
    type: 'enrichment',

    /* Note: The promise is because of the interface, not because this has any asynchronous behavior */
    execute: async (event: Event): Promise<Event> => {
      if (isNotSpecialAmplitudeEvent(event) || isAmplitudeIdentifyEvent(event)) {
        event.global_user_properties = event.user_properties;

        if (!options.shouldKeepOriginalUserProperties) {
          delete event.user_properties;
        }
      }

      return event;
    },
  };

  return plugin;
};
