import AmplitudeCore from '../src/AmplitudeCore';

describe('index', () => {
  describe('AmplitudeCore', () => {
    test('should instantiate AmplitudeCore', () => {
      const instance = new AmplitudeCore();
      expect(instance).toBeDefined();
    });
  });
});
