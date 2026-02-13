import { safeJsonStringify } from '../../src/index';

describe('safeJsonStringify', () => {
  test('should stringify a simple object', () => {
    const obj = { name: 'test', value: 123 };
    const result = safeJsonStringify(obj);
    expect(typeof result).toBe('string');
    expect(JSON.parse(result)).toEqual(obj);
  });

  test('should handle circular references safely', () => {
    const obj: any = { name: 'test' };
    obj.circular = obj; // Create circular reference

    // safe-json-stringify should handle this without throwing
    const result = safeJsonStringify(obj);
    expect(typeof result).toBe('string');
    expect(result).toContain('name');
    expect(result).toContain('test');
  });
});

