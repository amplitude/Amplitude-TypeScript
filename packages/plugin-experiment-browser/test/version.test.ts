import { VERSION } from '../src/version';

describe('version', () => {
  test('should be defined', () => {
    expect(VERSION).toBeDefined();
  });

  test('should be a valid semver string', () => {
    // Matches versions like 1.0.0, 1.0.0-beta.2, etc.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });
});
