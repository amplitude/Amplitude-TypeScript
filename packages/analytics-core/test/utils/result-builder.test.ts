import { Status } from '../../src/types/status';
import { buildResult } from '../../src/utils/result-builder';

describe('buildResult', () => {
  test('should return success', () => {
    const event = {
      event_type: 'hello',
    };
    const result = buildResult(event, 200, Status.Success);
    expect(result.event).toBeDefined();
    expect(result.code).toBe(200);
    expect(result.message).toBe(Status.Success);
  });

  test('should return default values', () => {
    const event = {
      event_type: 'hello',
    };
    const result = buildResult(event);
    expect(result.code).toBe(0);
    expect(result.message).toBe(Status.Unknown);
  });
});
