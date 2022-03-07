import { Fetch } from '../../src/transport/fetch';

describe('fetch', () => {
  describe('send', () => {
    test('should resolve with null', async () => {
      const provider = new Fetch();
      const result = await provider.send();
      expect(result).toBe(null);
    });
  });
});
