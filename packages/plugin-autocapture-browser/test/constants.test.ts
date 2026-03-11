import {
  AMPLITUDE_ORIGIN,
  AMPLITUDE_ORIGIN_EU,
  AMPLITUDE_ORIGIN_STAGING,
  AMPLITUDE_ORIGINS_MAP,
  AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL,
} from '../src/constants';

describe('constants re-exports from analytics-core', () => {
  test('should export AMPLITUDE_ORIGIN', () => {
    expect(AMPLITUDE_ORIGIN).toBe('https://app.amplitude.com');
  });

  test('should export AMPLITUDE_ORIGIN_EU', () => {
    expect(AMPLITUDE_ORIGIN_EU).toBe('https://app.eu.amplitude.com');
  });

  test('should export AMPLITUDE_ORIGIN_STAGING', () => {
    expect(AMPLITUDE_ORIGIN_STAGING).toBe('https://apps.stag2.amplitude.com');
  });

  test('should export AMPLITUDE_ORIGINS_MAP with all zones', () => {
    expect(AMPLITUDE_ORIGINS_MAP).toEqual({
      US: 'https://app.amplitude.com',
      EU: 'https://app.eu.amplitude.com',
      STAGING: 'https://apps.stag2.amplitude.com',
    });
  });

  test('should export AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL', () => {
    expect(typeof AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL).toBe('string');
    expect(AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL.length).toBeGreaterThan(0);
  });
});
