import { IdentifyOperation } from '@amplitude/analytics-types/lib/event';

export const UNSET_VALUE = '-';

export const USER_IDENTIFY_OPERATIONS = [
  IdentifyOperation.SET,
  IdentifyOperation.SET_ONCE,
  IdentifyOperation.ADD,
  IdentifyOperation.APPEND,
  IdentifyOperation.PREPEND,
  IdentifyOperation.REMOVE,
  IdentifyOperation.PREINSERT,
  IdentifyOperation.POSTINSERT,
  IdentifyOperation.UNSET,
  IdentifyOperation.CLEAR_ALL,
];
