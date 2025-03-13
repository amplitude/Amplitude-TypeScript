import { getStorageKey } from '../../src/storage/helpers';

describe('getStorageKey', () => {
  test('should return storage key without explicit suffix and limit', () => {
    expect(getStorageKey('API_KEY')).toBe('AMP_API_KEY');
  });

  test('should return storage key', () => {
    expect(getStorageKey('API_KEY', 'MKTG', 3)).toBe('AMP_MKTG_API');
  });
});
