import { valid } from 'semver';
import { version } from '../package.json';
import { VERSION } from '../src/version';

describe('version', () => {
  test('should be defined', () => {
    expect(VERSION).toBeDefined();
  });

  test('should be a valid semver string', () => {
    // Release workflows derive prerelease identifiers from hyphenated branch names.
    expect(valid(VERSION)).toBe(VERSION);
  });

  test('should match the package version', () => {
    expect(VERSION).toBe(version);
  });
});
