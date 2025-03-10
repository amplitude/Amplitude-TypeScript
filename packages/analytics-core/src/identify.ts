import { UNSET_VALUE } from './types/constants';
import { isValidProperties } from './utils/valid-properties';

export interface IIdentify {
  getUserProperties(): IdentifyUserProperties;
  set(property: string, value: ValidPropertyType): IIdentify;
  setOnce(property: string, value: ValidPropertyType): IIdentify;
  append(property: string, value: ValidPropertyType): IIdentify;
  prepend(property: string, value: ValidPropertyType): IIdentify;
  postInsert(property: string, value: ValidPropertyType): IIdentify;
  preInsert(property: string, value: ValidPropertyType): IIdentify;
  remove(property: string, value: ValidPropertyType): IIdentify;
  add(property: string, value: number): IIdentify;
  unset(property: string): IIdentify;
  clearAll(): IIdentify;
}

export class Identify implements IIdentify {
  protected readonly _propertySet: Set<string> = new Set<string>();
  protected _properties: IdentifyUserProperties = {};

  public getUserProperties(): IdentifyUserProperties {
    return { ...this._properties };
  }

  public set(property: string, value: ValidPropertyType): Identify {
    this._safeSet(IdentifyOperation.SET, property, value);
    return this;
  }

  public setOnce(property: string, value: ValidPropertyType): Identify {
    this._safeSet(IdentifyOperation.SET_ONCE, property, value);
    return this;
  }

  public append(property: string, value: ValidPropertyType): Identify {
    this._safeSet(IdentifyOperation.APPEND, property, value);
    return this;
  }

  public prepend(property: string, value: ValidPropertyType): Identify {
    this._safeSet(IdentifyOperation.PREPEND, property, value);
    return this;
  }

  public postInsert(property: string, value: ValidPropertyType): Identify {
    this._safeSet(IdentifyOperation.POSTINSERT, property, value);
    return this;
  }

  public preInsert(property: string, value: ValidPropertyType): Identify {
    this._safeSet(IdentifyOperation.PREINSERT, property, value);
    return this;
  }

  public remove(property: string, value: ValidPropertyType): Identify {
    this._safeSet(IdentifyOperation.REMOVE, property, value);
    return this;
  }

  public add(property: string, value: number): Identify {
    this._safeSet(IdentifyOperation.ADD, property, value);
    return this;
  }

  public unset(property: string): Identify {
    this._safeSet(IdentifyOperation.UNSET, property, UNSET_VALUE);
    return this;
  }

  public clearAll(): Identify {
    // When clear all happens, all properties are unset. Reset the entire object.
    this._properties = {};
    this._properties[IdentifyOperation.CLEAR_ALL] = UNSET_VALUE;

    return this;
  }

  // Returns whether or not this set actually worked.
  private _safeSet(operation: IdentifyOperation, property: string, value: ValidPropertyType): boolean {
    if (this._validate(operation, property, value)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      let userPropertyMap: any = this._properties[operation];
      if (userPropertyMap === undefined) {
        userPropertyMap = {};
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this._properties[operation] = userPropertyMap;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      userPropertyMap[property] = value;
      this._propertySet.add(property);
      return true;
    }

    return false;
  }

  private _validate(operation: IdentifyOperation, property: string, value: ValidPropertyType): boolean {
    if (this._properties[IdentifyOperation.CLEAR_ALL] !== undefined) {
      // clear all already set. Skipping operation;
      return false;
    }

    if (this._propertySet.has(property)) {
      // Property already used. Skipping operation
      return false;
    }

    if (operation === IdentifyOperation.ADD) {
      return typeof value === 'number';
    }

    if (operation !== IdentifyOperation.UNSET && operation !== IdentifyOperation.REMOVE) {
      return isValidProperties(property, value);
    }
    return true;
  }
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
