import { UUID } from '../../src/utils/uuid';

describe('UUID', () => {
  test('should generate a valid UUID-4', () => {
    const uuid = UUID();
    expect(uuid.length).toEqual(36);
    expect(uuid.substring(14, 15)).toEqual('4');
  });
});
