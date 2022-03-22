import { Status } from '@amplitude/analytics-types';
import { buildStatus } from '../../src/utils/status-builder';

describe('buildStatus', () => {
  test('should return success', () => {
    expect(buildStatus(200)).toBe(Status.Success);
  });

  test('should return rate limit', () => {
    expect(buildStatus(429)).toBe(Status.RateLimit);
  });

  test('should return payload too large', () => {
    expect(buildStatus(413)).toBe(Status.PayloadTooLarge);
  });

  test('should return timeout', () => {
    expect(buildStatus(408)).toBe(Status.Timeout);
  });

  test('should return invalid', () => {
    expect(buildStatus(400)).toBe(Status.Invalid);
  });

  test('should return failed', () => {
    expect(buildStatus(500)).toBe(Status.Failed);
  });

  test('should return unknown', () => {
    expect(buildStatus(0)).toBe(Status.Unknown);
  });
});
