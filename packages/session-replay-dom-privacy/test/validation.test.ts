import { parsePrivacyConfig, validatePrivacySelectors } from '../src';

const validate = (selector: string) => {
  document.createDocumentFragment().querySelector(selector);
};

describe('privacy policy validation', () => {
  test.each(['light', 'medium', 'conservative'])('accepts mask level %s', (defaultMaskLevel) => {
    expect(parsePrivacyConfig({ defaultMaskLevel }, validate).defaultMaskLevel).toBe(defaultMaskLevel);
  });

  test.each([
    { urlMaskLevels: 'invalid' },
    { urlMaskLevels: [null] },
    { urlMaskLevels: ['invalid'] },
    { urlMaskLevels: [{ match: 42, maskLevel: 'light' }] },
    { urlMaskLevels: [{ match: ' ', maskLevel: 'light' }] },
  ])('rejects malformed URL rules %j', (config) => {
    expect(() => parsePrivacyConfig(config, validate)).toThrow();
  });

  test('copies valid URL rules and selector arrays', () => {
    const config = { urlMaskLevels: [{ match: '/private/**', maskLevel: 'conservative' }], maskSelector: ['.private'] };
    const parsed = parsePrivacyConfig(config, validate);
    expect(parsed.urlMaskLevels).toEqual(config.urlMaskLevels);
    expect(parsed.urlMaskLevels).not.toBe(config.urlMaskLevels);
    expect(parsed.urlMaskLevels?.[0]).not.toBe(config.urlMaskLevels[0]);
    expect(parsed.maskSelector).toEqual(config.maskSelector);
    expect(parsed.maskSelector).not.toBe(config.maskSelector);
  });

  test('lets hosts report and omit invalid selectors while preserving valid selectors', () => {
    const onInvalid = jest.fn();
    const config = { blockSelector: ['[', '.private'], maskSelector: ['['], unmaskSelector: ['.public'] };
    expect(validatePrivacySelectors(config, validate, onInvalid)).toEqual({
      blockSelector: ['.private'],
      maskSelector: undefined,
      unmaskSelector: ['.public'],
    });
    expect(onInvalid.mock.calls).toEqual([['['], ['[']]);
    expect(config.blockSelector).toEqual(['[', '.private']);
  });
});
