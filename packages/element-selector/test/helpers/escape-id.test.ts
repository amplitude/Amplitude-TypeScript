/**
 * @jest-environment jsdom
 */
import { escapeIdForCss } from '../../src/helpers/escape-id';

describe('escapeIdForCss', () => {
  let originalCssDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalCssDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
  });

  afterEach(() => {
    if (originalCssDescriptor !== undefined) {
      Object.defineProperty(globalThis, 'CSS', originalCssDescriptor);
    } else {
      Object.defineProperty(globalThis, 'CSS', {
        configurable: true,
        value: undefined,
        writable: true,
      });
    }
    document.body.innerHTML = '';
  });

  it('delegates to native CSS.escape when it is available', () => {
    const escape = jest.fn((value: string) => `escaped(${value})`);
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: { escape },
      writable: true,
    });

    expect(escapeIdForCss('my.id')).toBe('escaped(my.id)');
    expect(escape).toHaveBeenCalledWith('my.id');
  });

  it('escapes numeric-leading ids when CSS.escape is unavailable', () => {
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    document.body.innerHTML = `<div id="123abc"></div><div id="-1abc"></div>`;

    expect(escapeIdForCss('123abc')).toBe('\\31 23abc');
    expect(document.querySelector(`div#${escapeIdForCss('123abc')}`)?.id).toBe('123abc');
    expect(escapeIdForCss('-1abc')).toBe('-\\31 abc');
    expect(document.querySelector(`div#${escapeIdForCss('-1abc')}`)?.id).toBe('-1abc');
  });
});
