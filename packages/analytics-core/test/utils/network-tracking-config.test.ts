import { normalizeNetworkCaptureRules } from '../../src/index';

describe('normalizeNetworkCaptureRules', () => {
  test('should return undefined when captureRules is undefined', () => {
    expect(normalizeNetworkCaptureRules(undefined)).toBeUndefined();
  });

  test('should clear hosts and warn when urls and hosts are both set', () => {
    const warn = jest.fn();
    const captureRules = normalizeNetworkCaptureRules(
      [{ urls: ['https://example.com/path', /path\/to/], hosts: ['example.com'] }],
      { warn },
    );

    expect(captureRules?.[0].hosts).toBeUndefined();
    expect(captureRules?.[0].urls).toEqual(['https://example.com/path', /path\/to/]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('both urls=\'["https://example.com/path",{}]\' and hosts=\'["example.com"]\''),
    );
  });

  test('should keep hosts when urls are not set', () => {
    const captureRules = normalizeNetworkCaptureRules([{ hosts: ['example.com', 'helloworld.com'] }]);

    expect(captureRules?.[0].hosts).toEqual(['example.com', 'helloworld.com']);
    expect(captureRules?.[0].urls).toBeUndefined();
  });

  test('should keep urls when hosts are not set', () => {
    const captureRules = normalizeNetworkCaptureRules([{ urls: ['https://example.com'] }]);

    expect(captureRules?.[0].hosts).toBeUndefined();
    expect(captureRules?.[0].urls).toEqual(['https://example.com']);
  });

  test('should not warn when logger is omitted and both urls and hosts are set', () => {
    const captureRules = normalizeNetworkCaptureRules([{ urls: ['https://example.com'], hosts: ['example.com'] }]);

    expect(captureRules?.[0].hosts).toBeUndefined();
    expect(captureRules?.[0].urls).toEqual(['https://example.com']);
  });
});
