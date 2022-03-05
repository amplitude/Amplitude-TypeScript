import { Status } from '@amplitude/analytics-types';
import { buildResult } from '../../src/utils/result-builder';

describe('buildResult', () => {
  test('should return success', () => {
    const result = buildResult(200, Status.Success);
    expect(result.statusCode).toBe(200);
    expect(result.status).toBe(Status.Success);
  });

  test('should return default values', () => {
    const result = buildResult();
    expect(result.statusCode).toBe(0);
    expect(result.status).toBe(Status.Unknown);
  });
});
