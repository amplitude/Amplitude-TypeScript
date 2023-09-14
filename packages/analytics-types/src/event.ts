import { BaseEvent } from './base-event';

export interface Identify {
  getUserProperties(): IdentifyUserProperties;
  set(property: string, value: ValidPropertyType): Identify;
  setOnce(property: string, value: ValidPropertyType): Identify;
  append(property: string, value: ValidPropertyType): Identify;
  prepend(property: string, value: ValidPropertyType): Identify;
  postInsert(property: string, value: ValidPropertyType): Identify;
  preInsert(property: string, value: ValidPropertyType): Identify;
  remove(property: string, value: ValidPropertyType): Identify;
  add(property: string, value: number): Identify;
  unset(property: string): Identify;
  clearAll(): Identify;
}

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
  | { [key: string]: ValidPropertyType };

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

export interface Revenue {
  getEventProperties(): RevenueEventProperties;
  setProductId(productId: string): Revenue;
  setQuantity(quantity: number): Revenue;
  setPrice(price: number): Revenue;
  setRevenueType(revenueType: string): Revenue;
  setEventProperties(properties: { [key: string]: any }): Revenue;
  setRevenue(revenue: number): Revenue;
}

export enum RevenueProperty {
  REVENUE_PRODUCT_ID = '$productId',
  REVENUE_QUANTITY = '$quantity',
  REVENUE_PRICE = '$price',
  REVENUE_TYPE = '$revenueType',
  REVENUE = '$revenue',
}

export interface RevenueEventProperties {
  [RevenueProperty.REVENUE_PRODUCT_ID]?: string;
  [RevenueProperty.REVENUE_QUANTITY]?: number;
  [RevenueProperty.REVENUE_PRICE]?: number;
  [RevenueProperty.REVENUE_TYPE]?: string;
  [RevenueProperty.REVENUE_TYPE]?: string;
  [RevenueProperty.REVENUE]?: number;
}

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
