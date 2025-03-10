import { BaseEvent } from './base-event';
import { RevenueEventProperties } from '../../revenue';

export enum IdentifyOperation {
  // Base Operations to set values
  SET = '$set',
  SET_ONCE = '$setOnce',

  // Operations around modifying existing values
  ADD = '$add',
  APPEND = '$append',
  PREPEND = '$prepend',
  REMOVE = '$remove',

  // Operations around appending values *if* they aren't present
  PREINSERT = '$preInsert',
  POSTINSERT = '$postInsert',

  // Operations around removing properties/values
  UNSET = '$unset',
  CLEAR_ALL = '$clearAll',
}

export type ValidPropertyType =
  | number
  | string
  | boolean
  | Array<string | number>
  | { [key: string]: ValidPropertyType }
  | Array<{ [key: string]: ValidPropertyType }>;

interface BaseOperationConfig {
  [key: string]: ValidPropertyType;
}

export interface IdentifyUserProperties {
  // Add operations can only take numbers
  [IdentifyOperation.ADD]?: { [key: string]: number };

  // This reads the keys of the passed object, but the values are not used
  [IdentifyOperation.UNSET]?: BaseOperationConfig;
  // This option does not read the key as it unsets all user properties
  [IdentifyOperation.CLEAR_ALL]?: any;

  // These operations can take numbers, strings, or arrays of both.
  [IdentifyOperation.SET]?: BaseOperationConfig;
  [IdentifyOperation.SET_ONCE]?: BaseOperationConfig;
  [IdentifyOperation.APPEND]?: BaseOperationConfig;
  [IdentifyOperation.PREPEND]?: BaseOperationConfig;
  [IdentifyOperation.POSTINSERT]?: BaseOperationConfig;
  [IdentifyOperation.PREINSERT]?: BaseOperationConfig;
  [IdentifyOperation.REMOVE]?: BaseOperationConfig;
}

export type UserProperties =
  | IdentifyUserProperties
  | {
      [key in Exclude<string, IdentifyOperation>]: any;
    };

/**
 * Strings that have special meaning when used as an event's type
 * and have different specifications.
 */
export enum SpecialEventType {
  IDENTIFY = '$identify',
  GROUP_IDENTIFY = '$groupidentify',
  REVENUE = 'revenue_amount',
}

export interface TrackEvent extends BaseEvent {
  event_type: Exclude<string, SpecialEventType>;
}

export interface IdentifyEvent extends BaseEvent {
  event_type: SpecialEventType.IDENTIFY;
  user_properties: UserProperties;
}

export interface GroupIdentifyEvent extends BaseEvent {
  event_type: SpecialEventType.GROUP_IDENTIFY;
  group_properties: UserProperties;
}

export interface RevenueEvent extends BaseEvent {
  event_type: SpecialEventType.REVENUE;
  event_properties:
    | RevenueEventProperties
    | {
        [key: string]: any;
      };
}

export type Event = TrackEvent | IdentifyEvent | GroupIdentifyEvent | RevenueEvent;
