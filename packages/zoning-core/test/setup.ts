type GlobalWithDomRect = typeof global & { DOMRect?: typeof DOMRect };

const globalScope = global as GlobalWithDomRect;

if (typeof globalScope.DOMRect === 'undefined') {
  globalScope.DOMRect = class DOMRect {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    top = 0;
    left = 0;
    right = 0;
    bottom = 0;
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.top = y;
      this.left = x;
      this.right = x + width;
      this.bottom = y + height;
    }
    toJSON(): this {
      return this;
    }
  } as typeof DOMRect;
}
