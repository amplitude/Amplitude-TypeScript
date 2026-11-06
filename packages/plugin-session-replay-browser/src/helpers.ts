import { getGlobalScope } from '@amplitude/analytics-core';
import { Event, IdentifyOperation } from '@amplitude/analytics-types';
import { PROPERTY_ADD_OPERATIONS } from './constants';

/**
 * Resolves when the page `load` event has fired (or immediately if it already has).
 * Used to defer Session Replay init off the critical path without changing sampling.
 */
export const waitForPageLoad = (): Promise<void> => {
  const globalScope = getGlobalScope();
  const document = globalScope?.document;
  if (!document) {
    return Promise.resolve();
  }
  if (document.readyState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    globalScope.addEventListener('load', () => resolve(), { once: true });
  });
};

export const parseUserProperties = (event: Event) => {
  if (!event.user_properties) {
    return;
  }
  let userPropertiesObj = {};
  const userPropertyKeys = Object.keys(event.user_properties);

  userPropertyKeys.forEach((identifyKey) => {
    if (PROPERTY_ADD_OPERATIONS.includes(identifyKey as IdentifyOperation)) {
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
