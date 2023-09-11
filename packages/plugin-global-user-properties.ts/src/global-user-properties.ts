import { BeforePlugin, Event } from '@amplitude/analytics-types';
import { GlobalUserPropertiesPlugin, Options } from './typings/global-user-properties';
import { isSpecialAmplitudeEvent } from 'src/helpers';


export const globalUserPropertiesPlugin: GlobalUserPropertiesPlugin = function (options: Options = {}) {
  const plugin: BeforePlugin = {
    name: '@amplitude/plugin-web-attribution-browser',
    type: 'before',

    setup: () => {},

    execute: (event: Event): Event => {
      // Skip amplitude special events
      if (isSpecialAmplitudeEvent(event)) {
        return event;
      };

      event.global_user_properties = event.user_properties;

      if (!options.shouldKeepOriginalUserProperties) {
        delete event.global_user_properties;
      }

      return event;
    },
  };

  return plugin;
};
