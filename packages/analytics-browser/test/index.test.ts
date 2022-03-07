import { init } from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    expect(typeof init).toBe('function');
  });
});
