import { UUID } from '../../src/utils/uuid';

describe('UUID', () => {
  test('should generate a valid UUID-4', () => {
    const uuid = UUID();
    expect(uuid.length).toEqual(36);
    expect(uuid.substring(14, 15)).toEqual('4');
  });

  test('should generate a unique UUID-4', () => {
    const ids = new Set();
    const count = 10000;
    for (let i = 0; i < count; i++) {
      ids.add(UUID());
    }
    expect(ids.size).toEqual(count);
  });
});
