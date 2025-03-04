/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { getGlobalScope } from '../src/global-scope';

describe('getGlobalScope', () => {
  let originalGlobalThis: any;

  beforeEach(() => {
    originalGlobalThis = globalThis;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    globalThis = originalGlobalThis;
    delete (globalThis as any).ampIntegrationContext;
  });

  test('returns ampIntegrationContext if it exists', () => {
    (globalThis as any).ampIntegrationContext = { someKey: 'someValue' };
    expect(getGlobalScope()).toBe((globalThis as any).ampIntegrationContext);
  });

  test('returns globalThis if ampIntegrationContext does not exist', () => {
    const scope = getGlobalScope();
    // Need to use Object.is because expect(scope).toBe(globalThis) will throw an error
    expect(Object.is(scope, globalThis)).toBeTruthy();
  });

  test('should return window if globalThis is undefined and window is defined', () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    globalThis = undefined;

    const scope = getGlobalScope();

    // Note: We NEED to reassign globalThis to its original state because the jest expect function requires it
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    globalThis = originalGlobalThis;
    // Need to use Object.is because expect(scope).toBe(globalThis) will throw an error
    expect(Object.is(scope, window)).toBeTruthy();
  });
});
