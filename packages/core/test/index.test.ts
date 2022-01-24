import { AmplitudeCore } from '../src/index';

describe('index', () => {
  describe('AmplitudeCore', () => {
    test('should export AmplitudeCore', () => {
      const instance = new AmplitudeCore();
      expect(instance).toBeDefined();
    });
  });
});
