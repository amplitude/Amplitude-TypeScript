/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-restricted-globals */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/**
 * Patterns of cookie names that are allowed to be set
 *
 * Do not add or modify patterns for this.
 * This is here to make sure cookie names are consistent
 * and to prevent accidental breaking changes.
 */
export const ALLOWED_COOKIE_PATTERNS = [
  'AMP_TEST',
  'AMP_TLDTEST',
  /^AMP_[0-9a-fA-F]{10,}$/,
  /^AMP_MKTG_[0-9a-fA-F]{10,}$/,
];

export function overrideCookieStoreStrict() {
  const win = window as any;
  const originalDescriptor = Object.getOwnPropertyDescriptor(win.document, 'cookie');
  let originalCookie = win.document.cookie;
  Object.defineProperty(win.document, 'cookie', {
    configurable: true,
    get() {
      return originalCookie;
    },
    set(data: string) {
      const params = data.split(';').map((param) => param.trim());
      // Cookie set format is "name=value; attr=val; ..." — name is the first segment's key
      const first = params[0];
      const eqIndex = first?.indexOf('=') ?? -1;
      const name = eqIndex >= 0 ? first.substring(0, eqIndex) : undefined;

      if (
        !ALLOWED_COOKIE_PATTERNS.some((pattern: string | RegExp) => {
          if (typeof pattern === 'string') {
            return pattern === name;
          } else if (name) {
            return pattern.test(name);
          }
          return false;
        })
      ) {
        throw new Error(`Illegal cookie name: ${name}`);
      }
      originalCookie = data;
    },
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(win.document, 'cookie', originalDescriptor);
    } else {
      // If there was no original descriptor, fall back to deleting the override.
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (win.document as any).cookie;
    }
  };
}
