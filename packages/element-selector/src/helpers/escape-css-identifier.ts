/* eslint-disable no-restricted-globals */

type CssEscapeGlobal = {
  CSS?: {
    escape?: (value: string) => string;
  };
};

/**
 * Escape a string for use as a CSS identifier.
 *
 * Uses the native CSS.escape implementation when available, with the CSSOM
 * algorithm inlined for runtimes that do not expose it (notably jsdom).
 */
export function escapeCssIdentifier(value: string): string {
  const css = (globalThis as CssEscapeGlobal).CSS;
  if (css && typeof css.escape === 'function') {
    return css.escape(value);
  }

  const string = String(value);
  const length = string.length;
  let result = '';

  for (let index = 0; index < length; index++) {
    const codeUnit = string.charCodeAt(index);

    if (codeUnit === 0x0000) {
      result += '\uFFFD';
      continue;
    }

    if (
      (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
      codeUnit === 0x007f ||
      (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && string.charCodeAt(0) === 0x002d)
    ) {
      result += `\\${codeUnit.toString(16)} `;
      continue;
    }

    if (index === 0 && length === 1 && codeUnit === 0x002d) {
      result += '\\-';
      continue;
    }

    if (
      codeUnit >= 0x0080 ||
      codeUnit === 0x002d ||
      codeUnit === 0x005f ||
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
      (codeUnit >= 0x0061 && codeUnit <= 0x007a)
    ) {
      result += string.charAt(index);
      continue;
    }

    result += `\\${string.charAt(index)}`;
  }

  return result;
}
