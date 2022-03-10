import { FetchTransport } from '../../src/transport/fetch';

describe('fetch', () => {
  describe('send', () => {
    test('should resolve with null', async () => {
      const provider = new FetchTransport();
      const result = await provider.send();
      expect(result).toBe(null);
    });
  });
});
