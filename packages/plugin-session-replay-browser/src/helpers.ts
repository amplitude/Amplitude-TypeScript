import { Event, IdentifyOperation } from '@amplitude/analytics-types';
import { PROPERTY_ADD_OPERATIONS } from './constants';

export const parseUserProperties = (event: Event) => {
  if (!event.user_properties) {
    return;
  }
  let userPropertiesObj = {};
  const userPropertyKeys = Object.keys(event.user_properties);

  userPropertyKeys.forEach((identifyKey) => {
    if (
      Object.values(IdentifyOperation).includes(identifyKey as IdentifyOperation) &&
      PROPERTY_ADD_OPERATIONS.includes(identifyKey as IdentifyOperation)
    ) {
      const typedUserPropertiesOperation =
        event.user_properties && (event.user_properties[identifyKey as IdentifyOperation] as Record<string, any>);
      userPropertiesObj = {
        ...userPropertiesObj,
        ...typedUserPropertiesOperation,
      };
    }
  });
  return userPropertiesObj;
};
