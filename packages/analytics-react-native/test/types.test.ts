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
});
