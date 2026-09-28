import { createPrivacyRecorderOptions, maskFn, parsePrivacyConfig } from '../src';

const validate = (selector: string) => {
  document.createDocumentFragment().querySelector(selector);
};

describe('shared DOM privacy contract', () => {
  test('masking attributes on ancestors beat unmasking descendants', () => {
    document.body.innerHTML = '<section data-amp-mask><span data-amp-unmask>secret</span></section>';
    const element = document.querySelector('span');
    expect(maskFn('text', { defaultMaskLevel: 'light' })('secret', element)).toBe('******');
  });

  test('attribute unmasking follows class unmasking and preserves whitespace', () => {
    document.body.innerHTML = '<section data-amp-unmask><span>hello world</span></section>';
    const element = document.querySelector('span');
    expect(maskFn('text', { defaultMaskLevel: 'conservative' })('hello world', element)).toBe('hello world');
  });

  test('URL changes are evaluated without rebuilding callbacks', () => {
    let url = 'https://example.com/public';
    const options = createPrivacyRecorderOptions(
      {
        defaultMaskLevel: 'medium',
        urlMaskLevels: [{ match: 'https://example.com/private/**', maskLevel: 'conservative' }],
      },
      () => url,
    );
    expect(options.maskTextSelector).toBe('*');
    expect(options.maskTextFn('secret', null)).toBe('secret');
    url = 'https://example.com/private';
    expect(options.maskTextFn('secret', null)).toBe('******');
  });

  test('attribute values use policy and style is never processed', () => {
    const element = document.createElement('input');
    const options = createPrivacyRecorderOptions({ maskAttributes: ['placeholder', 'style'] });
    expect(options.maskAttributeFn('placeholder', 'secret', element)).toBe('******');
    expect(options.maskAttributeFn('style', 'color:red', element)).toBe('color:red');
  });

  test('block attributes and classes are recognized without configuration', () => {
    expect(createPrivacyRecorderOptions().blockSelector).toBe('[data-amp-block]');
    expect(createPrivacyRecorderOptions().blockClass).toBe('amp-block');
    expect(createPrivacyRecorderOptions({ blockSelector: ['.secret'] }).blockSelector).toBe('.secret,[data-amp-block]');
  });

  test.each([
    null,
    [],
    { defaultMaskLevel: 'invalid' },
    { blockSelector: 42 },
    { maskSelector: [42] },
    { urlMaskLevels: [{ match: '*', maskLevel: 'invalid' }] },
    { blockSelector: '[' },
  ])('rejects malformed remote policy %j', (input) => {
    expect(() => parsePrivacyConfig(input, validate)).toThrow();
  });

  test('normalizes remote policy without retaining unknown fields or mutating input', () => {
    const input = { blockSelector: '.secret', futureField: 'ignored' };
    expect(parsePrivacyConfig(input, validate)).toEqual({ blockSelector: ['.secret'] });
    expect(input.blockSelector).toBe('.secret');
  });
});
