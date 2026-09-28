import { getBlockSelectors, getMaskTextSelectors, PrivacyConfig, globToRegex } from '../src';

describe('recorder privacy selectors', () => {
  test.each<[PrivacyConfig | undefined, string]>([
    [undefined, '[data-amp-block]'],
    [{}, '[data-amp-block]'],
    [{ blockSelector: '' }, '[data-amp-block]'],
    [{ blockSelector: [] }, '[data-amp-block]'],
    [{ blockSelector: '.private' }, '.private,[data-amp-block]'],
    [{ blockSelector: ['.private', '#secret'] }, '.private,#secret,[data-amp-block]'],
  ])('adds the block attribute to %j', (config, expected) => {
    expect(getBlockSelectors(config)).toBe(expected);
  });

  test.each<[PrivacyConfig | undefined, string | undefined, string]>([
    [undefined, undefined, '[data-amp-mask]'],
    [{}, undefined, '[data-amp-mask]'],
    [{ maskSelector: ['.private', '#secret'] }, undefined, '.private,#secret,[data-amp-mask]'],
    [{ defaultMaskLevel: 'conservative' }, undefined, '*'],
    [{ defaultMaskLevel: 'conservative', urlMaskLevels: [] }, undefined, '*'],
    [{ defaultMaskLevel: 'light', urlMaskLevels: [{ match: '/admin/*', maskLevel: 'conservative' }] }, '/public', '*'],
    [{ defaultMaskLevel: 'light', urlMaskLevels: [{ match: '/admin/*', maskLevel: 'conservative' }] }, '/admin/a', '*'],
    [
      { defaultMaskLevel: 'light', urlMaskLevels: [{ match: '/checkout/*', maskLevel: 'medium' }] },
      '/public',
      '[data-amp-mask]',
    ],
    [
      { defaultMaskLevel: 'conservative', urlMaskLevels: [{ match: '/public/*', maskLevel: 'light' }] },
      '/public/a',
      '*',
    ],
  ])('routes text for %j at %s', (config, url, expected) => {
    expect(getMaskTextSelectors(config, url)).toBe(expected);
  });

  test('exports URL glob matching for host URL rules', () => {
    expect(globToRegex('https://example.com/docs/**').test('https://example.com/docs')).toBe(true);
    expect(globToRegex('https://example.com/docs/**').test('https://example.com/other')).toBe(false);
  });
});
