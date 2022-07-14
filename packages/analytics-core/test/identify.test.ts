import { UNSET_VALUE } from '../src/constants';
import { IdentifyOperation } from '@amplitude/analytics-types';
import { Identify } from '../src/index';

describe('Identify class', () => {
  test('should see user property when using set', () => {
    const identify = new Identify();
    identify.set('PROPERTY_NAME', 'PROPERTY_VALUE');
    const properties = identify.getUserProperties();

    const expectedProperties = {
      [IdentifyOperation.SET]: { PROPERTY_NAME: 'PROPERTY_VALUE' },
    };

    expect(properties).toStrictEqual(expectedProperties);
  });

  test('should see user property when using set once', () => {
    const identify = new Identify();
    identify.setOnce('PROPERTY_NAME', 'PROPERTY_VALUE');

    const expectedProperties = {
      [IdentifyOperation.SET_ONCE]: { PROPERTY_NAME: 'PROPERTY_VALUE' },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should see user property when using add', () => {
    const identify = new Identify();
    identify.add('PROPERTY_NAME', 1);
    const expectedProperties = {
      [IdentifyOperation.ADD]: { PROPERTY_NAME: 1 },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should see user property when using append', () => {
    const identify = new Identify();
    identify.append('PROPERTY_NAME', 'PROPERTY_VALUE');
    const expectedProperties = {
      [IdentifyOperation.APPEND]: { PROPERTY_NAME: 'PROPERTY_VALUE' },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should see user property when using prepend', () => {
    const identify = new Identify();
    identify.prepend('PROPERTY_NAME', 'PROPERTY_VALUE');
    const expectedProperties = {
      [IdentifyOperation.PREPEND]: { PROPERTY_NAME: 'PROPERTY_VALUE' },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should see user property when using post-insert', () => {
    const identify = new Identify();
    identify.postInsert('PROPERTY_NAME', 'PROPERTY_VALUE');
    const expectedProperties = {
      [IdentifyOperation.POSTINSERT]: { PROPERTY_NAME: 'PROPERTY_VALUE' },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should see user property when using pre-insert', () => {
    const identify = new Identify();
    identify.preInsert('PROPERTY_NAME', 'PROPERTY_VALUE');
    const expectedProperties = {
      [IdentifyOperation.PREINSERT]: { PROPERTY_NAME: 'PROPERTY_VALUE' },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should see user property when using remove', () => {
    const identify = new Identify();
    identify.remove('PROPERTY_NAME', 'PROPERTY_VALUE');
    const expectedProperties = {
      [IdentifyOperation.REMOVE]: { PROPERTY_NAME: 'PROPERTY_VALUE' },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should see user property when using unset', () => {
    const identify = new Identify();
    identify.unset('PROPERTY_NAME');
    const expectedProperties = {
      [IdentifyOperation.UNSET]: { PROPERTY_NAME: UNSET_VALUE },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should see user property when using clear all', () => {
    const identify = new Identify();
    identify.clearAll();
    const expectedProperties = {
      [IdentifyOperation.CLEAR_ALL]: UNSET_VALUE,
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should allow multiple properties to be added', () => {
    const identify = new Identify();
    identify.set('PROPERTY_NAME', 'PROPERTY_VALUE');
    identify.set('PROPERTY_NAME_TWO', 1);
    identify.append('PROPERTY_NAME_THREE', 'PROPERTY_VALUE');
    const expectedProperties = {
      [IdentifyOperation.SET]: {
        PROPERTY_NAME: 'PROPERTY_VALUE',
        PROPERTY_NAME_TWO: 1,
      },
      [IdentifyOperation.APPEND]: {
        PROPERTY_NAME_THREE: 'PROPERTY_VALUE',
      },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should not allow non-string property names', () => {
    const identify = new Identify();
    // this should be ignored
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    identify.set(3 as any, 'PROPERTY_VALUE');
    const expectedProperties = {};

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should not set any new properties after clear all', () => {
    const identify = new Identify();
    identify.clearAll().set('PROPERTY_NAME', 'PROPERTY_VALUE');
    const expectedProperties = {
      [IdentifyOperation.CLEAR_ALL]: UNSET_VALUE,
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should not set any properties twice', () => {
    const identify = new Identify();
    identify.set('PROPERTY_NAME', 'PROPERTY_VALUE');
    // these two should be ignored
    identify.set('PROPERTY_NAME', 1);
    identify.append('PROPERTY_NAME', 'PROPERTY_VALUE');
    const expectedProperties = {
      [IdentifyOperation.SET]: { PROPERTY_NAME: 'PROPERTY_VALUE' },
    };

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should not allow non-numeric add values', () => {
    const identify = new Identify();
    // this should be ignored
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    identify.add('PROPERTY_NAME', 'PROPERTY_VALUE' as any);
    const expectedProperties = {};

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should not allow to set a key to null', () => {
    const identify = new Identify();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore bypassing ts rules to test unexpected input
    identify.set('PROPERTY_NAME', null);
    const expectedProperties = {};

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });

  test('should not allow to set a key to undefined', () => {
    const identify = new Identify();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore bypassing ts rules to test unexpected input
    identify.set('PROPERTY_NAME', undefined);
    const expectedProperties = {};

    expect(identify.getUserProperties()).toStrictEqual(expectedProperties);
  });
});
