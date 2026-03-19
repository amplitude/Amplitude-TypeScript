// legal cookie names
// do not add or remove from this unless you're certain the new
// cookie names will be accepted in a strict cookie environment
const LEGAL_COOKIE_PATTERNS = [
  'AMP_TEST', 'AMP_TLDTEST',
  /^AMP_MKTG_[A-Za-z0-9]{10}$/,
  /^AMP_[A-Za-z0-9]{10}$/,
];

  const desc = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");

  Object.defineProperty(document, "cookie", {
    configurable: true,
    enumerable: true,
    get() {
      return desc.get.call(document);
    },
    set(value) {
      const name = value.split("=")[0].trim();
      if (!LEGAL_COOKIE_PATTERNS.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test(name);
        }
        return pattern === name;
      })) {
        throw new Error(`Illegal cookie name: ${name}`)
      }
      return desc.set.call(document, value);
    },
  });