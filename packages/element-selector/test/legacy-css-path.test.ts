/**
 * @jest-environment jsdom
 *
 * `legacyCssPath` is the byte-for-byte port of the Chromium-DevTools walker
 * that autocapture has shipped since before the strategy engine existed.
 * Comprehensive coverage of the algorithm lives in the SDK plugin's own
 * suite (the original home of this code); we keep this file lean and
 * focused on:
 *
 *  - the public-API guarantees the engine + dashboard rely on,
 *  - the round-trip invariant ("selector resolves back to the same element"),
 *  - and the defensive paths (non-element nodes).
 *
 * The walker itself is `istanbul ignore file`d in `legacy-css-path.ts` —
 * line-by-line coverage here would duplicate what the SDK suite already
 * exercises and bury the meaningful coverage in this package.
 */
import { legacyCssPath } from '../src/legacy-css-path';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('legacyCssPath', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns an empty string for non-element nodes', () => {
    // The walker's first line is a defensive nodeType check; consumers in
    // both repos rely on `''` here, never a throw.
    const textNode = document.createTextNode('x') as unknown as Element;
    expect(legacyCssPath(textNode)).toBe('');
  });

  it('returns a selector that resolves back to the same element (round-trip)', () => {
    setBody(`<main><section><button class="cta">click</button></section></main>`);
    const target = document.querySelector('button.cta') as Element;
    const selector = legacyCssPath(target);

    expect(selector.length).toBeGreaterThan(0);
    expect(document.querySelector(selector)).toBe(target);
  });

  it('uses id as an anchor step when present', () => {
    setBody(`<section><button id="login">click</button></section>`);
    const target = document.querySelector('button') as Element;
    const selector = legacyCssPath(target);

    // id-bearing step terminates the walk early — selector should end with
    // the id and resolve to the target.
    expect(selector).toContain('#login');
    expect(document.querySelector(selector)).toBe(target);
  });

  it('disambiguates same-tag siblings via :nth-child', () => {
    setBody(`<ul><li>a</li><li>b</li><li>c</li></ul>`);
    const target = document.querySelectorAll('li')[1] as Element;
    const selector = legacyCssPath(target);

    expect(selector).toContain(':nth-child');
    expect(document.querySelector(selector)).toBe(target);
  });
});
