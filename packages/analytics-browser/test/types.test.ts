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
      expect((amplitude.Types as any)[enumType]).toBeDefined();
      expect(typeof (amplitude.Types as any)[enumType]).toBe('object');
      expect(Object.keys((amplitude.Types as any)[enumType]).length).toBeGreaterThan(0);
    });
  });
  
  test('exported null to be null', () => {
    expect(amplitude.Types.OfflineDisabled).toBe(null);
  });
  
  test('exported arrays are proper arrays', () => {
    const arrTypes = ['DEFAULT_CSS_SELECTOR_ALLOWLIST', 'DEFAULT_ACTION_CLICK_ALLOWLIST'];
    arrTypes.forEach((arrType) => {
      expect((amplitude.Types as any)[arrType]).toBeDefined();
      expect(Array.isArray((amplitude.Types as any)[arrType])).toBe(true);
      expect(((amplitude.Types as any)[arrType] as any).length).toBeGreaterThan(0);
    });
  });

  test('exported string is string', () => {
    expect(typeof amplitude.Types.DEFAULT_DATA_ATTRIBUTE_PREFIX).toBe('string');
  });
});
