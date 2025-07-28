import { IdentifyOperation } from '@amplitude/analytics-types';

export const PROPERTY_ADD_OPERATIONS = [
  IdentifyOperation.SET,
  IdentifyOperation.SET_ONCE,
  IdentifyOperation.ADD,
  IdentifyOperation.APPEND,
  IdentifyOperation.PREPEND,
  IdentifyOperation.POSTINSERT,
];
