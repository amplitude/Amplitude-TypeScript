import { handleUnknownError } from '../../src/utils/result-builder';

describe('handleUnknownError', () => {
  test('should handle error instance of Error', () => {
    const result = handleUnknownError(new Error());
    expect(result.code).toBe(0);
    expect(result.message).toBe('');
    expect(result.success).toBe(false);
  });

  test('should handle error as string', () => {
    const result = handleUnknownError('error');
    expect(result.code).toBe(0);
    expect(result.message).toBe('error');
    expect(result.success).toBe(false);
  });

  test('should handle error as other type', () => {
    const result = handleUnknownError({ success: false });
    expect(result.code).toBe(0);
    expect(result.message).toBe(JSON.stringify({ success: false }));
    expect(result.success).toBe(false);
  });
});
