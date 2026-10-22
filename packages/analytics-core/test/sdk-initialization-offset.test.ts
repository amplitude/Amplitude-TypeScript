import * as globalScope from '../src/global-scope';
import {
  AMPLITUDE_EVENT_PROP_SDK_INITIALIZATION_OFFSET,
  clearSdkInitializationOffset,
  getSdkInitializationOffset,
} from '../src/sdk-initialization-offset';

describe('sdk initialization offset', () => {
  beforeEach(() => {
    jest.spyOn(globalScope, 'getGlobalScope').mockImplementation(() => globalThis);
    clearSdkInitializationOffset();
  });

  test('floors performance.now and keeps that sample for the same project', () => {
    jest.spyOn(performance, 'now').mockReturnValueOnce(2500.7).mockReturnValue(9000);

    expect(getSdkInitializationOffset('api-a')).toBe(2500);
    expect(getSdkInitializationOffset('api-a')).toBe(2500);
    expect(AMPLITUDE_EVENT_PROP_SDK_INITIALIZATION_OFFSET).toBe('[Amplitude] SDK Initialization Offset');
  });

  test('samples each project separately', () => {
    jest.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(4000.2);

    expect(getSdkInitializationOffset('api-a')).toBe(1000);
    expect(getSdkInitializationOffset('api-b')).toBe(4000);
    expect(getSdkInitializationOffset('api-a')).toBe(1000);
  });

  test('treats a missing api key as one bucket', () => {
    jest.spyOn(performance, 'now').mockReturnValue(80);

    expect(getSdkInitializationOffset()).toBe(80);
    expect(getSdkInitializationOffset('')).toBe(80);
  });

  test('returns 0 when the performance clock is missing, not finite, negative, or throws', () => {
    const scope = {} as typeof globalThis;
    jest.spyOn(globalScope, 'getGlobalScope').mockImplementation(() => scope);
    expect(getSdkInitializationOffset('api-a')).toBe(0);
    expect(getSdkInitializationOffset('api-a')).toBe(0);

    clearSdkInitializationOffset();
    Object.defineProperty(scope, 'performance', {
      configurable: true,
      value: {},
    });
    expect(getSdkInitializationOffset('api-a')).toBe(0);

    clearSdkInitializationOffset();
    Object.defineProperty(scope, 'performance', {
      configurable: true,
      value: { now: () => Number.NaN },
    });
    expect(getSdkInitializationOffset('api-a')).toBe(0);

    clearSdkInitializationOffset();
    Object.defineProperty(scope, 'performance', {
      configurable: true,
      value: { now: () => Number.POSITIVE_INFINITY },
    });
    expect(getSdkInitializationOffset('api-a')).toBe(0);

    clearSdkInitializationOffset();
    Object.defineProperty(scope, 'performance', {
      configurable: true,
      value: { now: () => -20.4 },
    });
    expect(getSdkInitializationOffset('api-a')).toBe(0);

    clearSdkInitializationOffset();
    Object.defineProperty(scope, 'performance', {
      configurable: true,
      value: {
        now: () => {
          throw new Error('clock unavailable');
        },
      },
    });
    expect(getSdkInitializationOffset('api-a')).toBe(0);
  });

  test('returns 0 when there is no global scope', () => {
    jest.spyOn(globalScope, 'getGlobalScope').mockReturnValue(undefined);
    expect(getSdkInitializationOffset('api-a')).toBe(0);
    expect(() => clearSdkInitializationOffset()).not.toThrow();
  });

  test('measures again after the cached sample is cleared', () => {
    jest.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(30);

    expect(getSdkInitializationOffset('api-a')).toBe(10);
    clearSdkInitializationOffset();
    expect(getSdkInitializationOffset('api-a')).toBe(30);
  });
});
