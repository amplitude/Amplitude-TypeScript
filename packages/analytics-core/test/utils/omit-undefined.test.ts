import { omitUndefined } from '../../src/utils/omit-undefined';

describe('omitUndefined', () => {
  test('should omit undefined and empty values', () => {
    expect(
      omitUndefined({
        utm_source: 'google',
        utm_medium: '',
        utm_campaign: undefined,
      }),
    ).toEqual({
      utm_source: 'google',
    });
  });
});
