require('css.escape');

// Polyfill innerText for jsdom since it doesn't support it properly
Object.defineProperty(HTMLElement.prototype, 'innerText', {
  get(this: HTMLElement): string {
    return this.textContent ?? '';
  },
  set(this: HTMLElement, value: string) {
    this.textContent = value;
  },
});
