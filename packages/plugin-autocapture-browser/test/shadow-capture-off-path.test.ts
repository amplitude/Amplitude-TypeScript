/**
 * @jest-environment jsdom
 *
 * Capture-side kill-switch differential: when shadow mode is off, helpers must
 * behave identically to the pre-shadow implementation even on DOMs that contain
 * open shadow roots.
 */
import { getClosestElement, querySelectorAllDeep } from '../src/helpers';
import { getAncestors } from '../src/hierarchy';
import { SHADOW_OFF } from '../src/shadow-mode';

function attachOpen(host: Element, html: string): ShadowRoot {
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = html;
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('capture off-path differential — shadow mode is a strict no-op when off', () => {
  it('getClosestElement stops at the shadow boundary (default / SHADOW_OFF)', () => {
    document.body.innerHTML = `<div id="app"><my-host></my-host></div>`;
    const host = document.querySelector('my-host') as Element;
    const root = attachOpen(host, `<button class="track">shadow</button>`);
    const inner = root.querySelector('button') as Element;

    expect(getClosestElement(inner, ['#app'])).toBeNull();
    expect(getClosestElement(inner, ['#app'], SHADOW_OFF)).toBeNull();
  });

  it('getAncestors returns only the element itself inside a shadow root', () => {
    document.body.innerHTML = `<div id="app"><my-host></my-host></div>`;
    const host = document.querySelector('my-host') as Element;
    const root = attachOpen(host, `<button id="inner">x</button>`);
    const inner = root.getElementById('inner') as Element;

    expect(getAncestors(inner)).toEqual([inner]);
    expect(getAncestors(inner, SHADOW_OFF)).toEqual([inner]);
  });

  it('querySelectorAllDeep does not pierce shadow roots', () => {
    document.body.innerHTML = `<button class="track">light</button><my-host></my-host>`;
    attachOpen(document.querySelector('my-host') as Element, `<button class="track">shadow</button>`);

    const found = querySelectorAllDeep(document, '.track');
    expect(found.map((el) => el.textContent)).toEqual(['light']);
    expect(querySelectorAllDeep(document, '.track', SHADOW_OFF).map((el) => el.textContent)).toEqual(['light']);
  });
});
