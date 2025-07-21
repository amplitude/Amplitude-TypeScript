import * as amplitude from '../src/index';

describe('Type Exports', () => {
  test('IdentifyOperation should be an enum', () => {
    expect(amplitude.Types.IdentifyOperation.ADD).toBe('$add');
  });

  test('SpecialEventType should be an enum', () => {
    expect(amplitude.Types.SpecialEventType.IDENTIFY).toBe('$identify');
  });

  test('exported enums are proper enums', () => {
    const enumTypes = ['RevenueProperty', 'LogLevel', 'ServerZone'];
    enumTypes.forEach((enumType) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((amplitude.Types as any)[enumType]).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(typeof (amplitude.Types as any)[enumType]).toBe('object');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      expect(Object.keys((amplitude.Types as any)[enumType]).length).toBeGreaterThan(0);
    });
  });

  test('exported arrays are proper arrays', () => {
    const arrTypes = ['DEFAULT_CSS_SELECTOR_ALLOWLIST', 'DEFAULT_ACTION_CLICK_ALLOWLIST'];
    arrTypes.forEach((arrType) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((amplitude.Types as any)[arrType]).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(Array.isArray((amplitude.Types as any)[arrType])).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion
      expect(((amplitude.Types as any)[arrType] as any).length).toBeGreaterThan(0);
    });
  });
});
