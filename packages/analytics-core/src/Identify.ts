import { IdentifyOperation, IdentifyUserProperties, ValidPropertyType } from '@amplitude/analytics-types/lib/event';
import { UNSET_VALUE, USER_IDENTIFY_OPERATIONS } from './constant';
import { isValidProperties } from './utils/valid-properties';

interface IIdentify {
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

export class Identify implements IIdentify {
  protected readonly _propertySet: Set<string> = new Set<string>();
  protected _properties: IdentifyUserProperties = {};

  public getUserProperties(): IdentifyUserProperties {
    const userPropertiesCopy: IdentifyUserProperties = {};
    for (const field of USER_IDENTIFY_OPERATIONS) {
      if (field in this._properties) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        userPropertiesCopy[field] = this._properties[field];
      }
    }

    return userPropertiesCopy;
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
      return false;
    }

    if (this._propertySet.has(property)) {
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
