import targeting from '../src/targeting-factory';

describe('targeting factory', () => {
  describe('targeting instance', () => {
    test('return an instance of the targeting class', async () => {
      expect(Object.keys(targeting)).toEqual(['evaluateTargeting']);
    });
  });
});
