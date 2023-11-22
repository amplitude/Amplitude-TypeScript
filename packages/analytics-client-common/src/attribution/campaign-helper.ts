import { Event, IdentifyOperation, IdentifyUserProperties } from '@amplitude/analytics-types';
import { BASE_CAMPAIGN } from './constants';

export const isCampaignEvent = (event: Event) => {
  if (event.user_properties) {
    const properties = event.user_properties as IdentifyUserProperties;
    const $set = properties[IdentifyOperation.SET] || {};
    const $unset = properties[IdentifyOperation.UNSET] || {};
    const userProperties = [...Object.keys($set), ...Object.keys($unset)];
    return Object.keys(BASE_CAMPAIGN).every((value) => userProperties.includes(value));
  }
  return false;
};
