import { filterValidProperties, isValidProperties } from '../../src/utils/valid-properties';

describe('isValidProperties', () => {
  test('should pass on valid properties', () => {
    const validProperties = {
      keyForString: 'stringValue',
      keyForNumber: 123,
      keyForArray: ['test', 456, { arrayObjKey1: 'arrayObjValue1' }],
      keyForObj: {
        objKey1: 'objValue1',
        objKey2: 'objValue2',
      },
    };
    expect(isValidProperties('property', validProperties)).toBe(true);
  });

  test('should fail on invalid object with property keys more than MAX_PROPERTY_KEYS', () => {
    const inValidProperties: { [key: string]: number } = Array(1001)
      .fill(true)
      .reduce((acc: { [key: string]: number }, _, index) => {
        acc[`key-${index}`] = index;
        return acc;
      }, {});

    expect(isValidProperties('property', inValidProperties)).toBe(false);
  });

  test('should fail on invalid properties with function as value', () => {
    const testFunc = (): string => {
      return 'test';
    };
    const inValidProperties = {
      keyForFunct: testFunc,
    };
    expect(isValidProperties('property', inValidProperties)).toBe(false);
  });

  test('should fail on invalid properties with array nested in array', () => {
    const inValidProperties = ['item1', 123, ['subItem1', 'subItem2']];
    expect(isValidProperties('property', inValidProperties)).toBe(false);
  });

  test('should fail on invalid property with no number and no string value', () => {
    const inValidProperties = [true, false, false];
    expect(isValidProperties('property', inValidProperties)).toBe(false);
  });

  test('should fail on invalid property with invalid object in array', () => {
    const inValidProperties = [{ keyForString: 'stringValue' }, { keyForString: [['stringValue']] }, 15];
    expect(isValidProperties('property', inValidProperties)).toBe(false);
  });

  test('should fail when any key is not string', () => {
    const validProperties = {
      keyForString: 'stringValue',
      keyForNumber: 123,
      keyForArray: ['test', 456],
      keyForObj: {
        objKey1: 'objValue1',
        objKey2: 'objValue2',
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    expect(isValidProperties(1 as any, validProperties)).toBe(false);
  });

  test('should return false for null value', () => {
    expect(isValidProperties('key', null)).toBe(false);
  });

  test('should return false for undefined value', () => {
    expect(isValidProperties('key', undefined)).toBe(false);
  });
});

describe('filterValidProperties', () => {
  test('should return all properties when all are valid', () => {
    const properties = { name: 'test', count: 42, flag: true };
    expect(filterValidProperties(properties)).toEqual(properties);
  });

  test('should filter out undefined values instead of rejecting the whole object', () => {
    const properties = { name: 'test', price: undefined, count: 42 };
    expect(filterValidProperties(properties)).toEqual({ name: 'test', count: 42 });
  });

  test('should filter out null values', () => {
    const properties = { name: 'test', nullProp: null };
    expect(filterValidProperties(properties)).toEqual({ name: 'test' });
  });

  test('should filter out function values', () => {
    const properties = { name: 'test', fn: () => 'value' };
    expect(filterValidProperties(properties)).toEqual({ name: 'test' });
  });

  test('should return empty object when all properties are invalid', () => {
    const properties = { a: undefined, b: null };
    expect(filterValidProperties(properties)).toEqual({});
  });

  test('should recursively filter invalid properties in nested objects', () => {
    const properties = {
      someProp: {
        validVal: 'val',
        invalidVal: undefined,
        someProp2: {
          validVal: 'val',
          invalidVal: undefined,
        },
      },
    };
    expect(filterValidProperties(properties)).toEqual({ someProp: { validVal: 'val', someProp2: { validVal: 'val' } } });
  });
});
