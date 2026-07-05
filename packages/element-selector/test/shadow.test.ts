/**
 * @jest-environment jsdom
 *
 * Shadow-DOM traversal + re-resolution unit tests, plus the engine's
 * composite-selector behavior. jsdom supports `attachShadow({ mode: 'open' })`,
 * `getRootNode`, and `querySelector` on a `ShadowRoot`, so these exercise the
 * real primitives rather than mocks.
 */
import {
  SHADOW_BOUNDARY_DELIMITER,
  SHADOW_CHILD_CHAIN_PREFIX,
  rootOf,
  composedParent,
  segmentWalk,
  resolveSelector,
  positionalStep,
} from '../src/helpers/shadow';
import { createSelectorEngine } from '../src/engine';
import { resolveSelectorConfig } from '../src/config/resolve-config';
import { ResolvedSelectorConfig } from '../src/types';

/** Attach an open shadow root to `host` and set its markup. Returns the root. */
function attachOpen(host: Element, html: string): ShadowRoot {
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = html;
  return root;
}

function shadowConfig(overrides: Partial<ResolvedSelectorConfig> = {}): ResolvedSelectorConfig {
  return { ...resolveSelectorConfig({ enabled: true, shadowDomEnabled: true }), ...overrides };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('composedParent', () => {
  it('returns the light-DOM parent within a single tree', () => {
    document.body.innerHTML = `<div id="wrap"><span id="child"></span></div>`;
    const child = document.getElementById('child') as Element;
    expect(composedParent(child)).toBe(document.getElementById('wrap'));
  });

  it('crosses the shadow boundary to the host at the top of a shadow tree', () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const host = document.querySelector('my-host') as Element;
    const root = attachOpen(host, `<button id="inner">x</button>`);
    const inner = root.getElementById('inner') as Element;
    // inner's parentElement is null at the top of the shadow tree → host.
    expect(composedParent(inner)).toBe(host);
  });

  it('returns null at the document root', () => {
    expect(composedParent(document.documentElement)).toBeNull();
  });
});

describe('rootOf', () => {
  it('returns the owner document for a light-DOM element', () => {
    document.body.innerHTML = `<div id="x"></div>`;
    expect(rootOf(document.getElementById('x') as Element)).toBe(document);
  });

  it('returns the enclosing shadow root for a shadow element', () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<button id="b">x</button>`);
    expect(rootOf(root.getElementById('b') as Element)).toBe(root);
  });
});

describe('segmentWalk', () => {
  it('returns a single document-rooted segment for a flat element (no boundary)', () => {
    document.body.innerHTML = `<div><button id="b">x</button></div>`;
    const target = document.getElementById('b') as Element;
    const { segments, truncated } = segmentWalk(target, 1);
    expect(truncated).toBe(false);
    expect(segments).toHaveLength(1);
    expect(segments[0].root).toBe(document);
    expect(segments[0].target).toBe(target);
  });

  it('splits a 2-level nesting into 3 outermost-first segments', () => {
    document.body.innerHTML = `<div id="app"><my-card></my-card></div>`;
    const card = document.querySelector('my-card') as Element;
    const cardRoot = attachOpen(card, `<section><my-button></my-button></section>`);
    const button = cardRoot.querySelector('my-button') as Element;
    const buttonRoot = attachOpen(button, `<button id="cta">x</button>`);
    const cta = buttonRoot.getElementById('cta') as Element;

    const { segments, truncated } = segmentWalk(cta, 10);
    expect(truncated).toBe(false);
    expect(segments).toHaveLength(3);
    // Outermost first: document tree (locating the my-card host) → card's
    // shadow root (locating the my-button host) → button's shadow root (cta).
    expect(segments[0].root).toBe(document);
    expect(segments[0].target).toBe(card);
    expect(segments[1].root).toBe(cardRoot);
    expect(segments[1].target).toBe(button);
    expect(segments[2].root).toBe(buttonRoot);
    expect(segments[2].target).toBe(cta);
  });

  it('truncates inner trees beyond the depth budget, targeting the in-budget host', () => {
    document.body.innerHTML = `<div id="app"><my-card></my-card></div>`;
    const card = document.querySelector('my-card') as Element;
    const cardRoot = attachOpen(card, `<my-button></my-button>`);
    const button = cardRoot.querySelector('my-button') as Element;
    const buttonRoot = attachOpen(button, `<button id="cta">x</button>`);
    const cta = buttonRoot.getElementById('cta') as Element;

    // Budget of 1 crossing: keep document tree + card's shadow root only; the
    // innermost kept segment targets `button` (the over-budget host), not cta.
    const { segments, truncated } = segmentWalk(cta, 1);
    expect(truncated).toBe(true);
    expect(segments).toHaveLength(2);
    expect(segments[0].root).toBe(document);
    expect(segments[0].target).toBe(card);
    expect(segments[1].root).toBe(cardRoot);
    expect(segments[1].target).toBe(button);
  });
});

describe('positionalStep', () => {
  it('disambiguates a shadow-root-top element against its same-tag siblings', () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<div></div><div id="second"></div>`);
    const second = root.getElementById('second') as Element;
    expect(positionalStep(second)).toBe('div:nth-of-type(2)');
  });
});

describe('resolveSelector', () => {
  it('resolves a plain (non-delimited) selector like querySelector', () => {
    document.body.innerHTML = `<div id="x"><button>y</button></div>`;
    const target = document.querySelector('#x > button') as Element;
    expect(resolveSelector(document, '#x > button')).toBe(target);
  });

  it('round-trips a generated selector through one shadow boundary', () => {
    document.body.innerHTML = `<div id="app"><my-card></my-card></div>`;
    const card = document.querySelector('my-card') as Element;
    const root = attachOpen(card, `<button id="cta">x</button>`);
    const cta = root.getElementById('cta') as Element;

    const engine = createSelectorEngine(shadowConfig());
    const selector = engine.generate(cta);
    expect(selector).toContain(SHADOW_BOUNDARY_DELIMITER);
    expect(resolveSelector(document, selector)).toBe(cta);
  });

  it('round-trips a generated selector through two shadow boundaries', () => {
    document.body.innerHTML = `<div id="app"><my-card></my-card></div>`;
    const card = document.querySelector('my-card') as Element;
    const cardRoot = attachOpen(card, `<section><my-button></my-button></section>`);
    const button = cardRoot.querySelector('my-button') as Element;
    const buttonRoot = attachOpen(button, `<button id="cta">x</button>`);
    const cta = buttonRoot.getElementById('cta') as Element;

    const engine = createSelectorEngine(shadowConfig({ maxShadowDomDepth: 2 }));
    const selector = engine.generate(cta);
    expect(selector.split(SHADOW_BOUNDARY_DELIMITER)).toHaveLength(3);
    expect(resolveSelector(document, selector)).toBe(cta);
  });

  it('round-trips an id-less element inside a shadow root that has many same-tag divs', () => {
    // Regression for the orange.fr finding: a bare positional chain like
    // `div:nth-of-type(2)` is NOT anchored inside a shadow root — it matches
    // every 2nd-of-type div tree-wide. The fallback must anchor with `:scope >`
    // so the selector stays unique and round-trips.
    document.body.innerHTML = `<div id="app"><my-header></my-header></div>`;
    const host = document.querySelector('my-header') as Element;
    const root = attachOpen(
      host,
      // The FIRST direct-child subtree contains a nested 2nd-of-type div, which
      // precedes the target in document order. So a bare `div:nth-of-type(2)`
      // resolves to that nested div, NOT the target — the orange.fr failure.
      `<div><div>x</div><div>y</div></div>
       <div>target</div>
       <div>three</div>`,
    );
    // Target: the 2nd direct-child <div> of the shadow root.
    const target = root.children[1];

    const engine = createSelectorEngine(shadowConfig({ maxShadowDomDepth: 1 }));
    const selector = engine.generate(target);

    // Sanity: a bare `querySelector` for the shadow segment is ambiguous here —
    // multiple divs match `div:nth-of-type(2)` tree-wide, and the first in
    // document order is NOT our target. This is the orange.fr failure mode.
    expect(root.querySelectorAll('div:nth-of-type(2)').length).toBeGreaterThan(1);
    expect(root.querySelector('div:nth-of-type(2)')).not.toBe(target);
    // The shadow segment is marked as a root-anchored child chain (`:scope > `),
    // and resolveSelector round-trips it via strict direct-child descent.
    expect(selector).toContain(SHADOW_CHILD_CHAIN_PREFIX);
    expect(resolveSelector(document, selector)).toBe(target);
  });

  it('returns null when a pure-positional shadow segment matches no direct child', () => {
    document.body.innerHTML = `<div id="app"><my-host></my-host></div>`;
    const host = document.querySelector('my-host') as Element;
    attachOpen(host, `<div>a</div><div>b</div>`);
    // Only two direct-child divs exist; the child-chain resolver finds no match.
    expect(resolveSelector(document, `div#app > my-host >>> div:nth-of-type(9)`)).toBeNull();
  });

  it('returns null when a boundary crossing hits a closed shadow root', () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const host = document.querySelector('my-host') as Element;
    // Closed root: host.shadowRoot is null from outside, so a delimited
    // selector can't descend.
    host.attachShadow({ mode: 'closed' });
    expect(resolveSelector(document, `my-host >>> button:nth-of-type(1)`)).toBeNull();
  });

  it('returns null when a segment matches nothing', () => {
    document.body.innerHTML = `<div id="app"></div>`;
    expect(resolveSelector(document, `div#app >>> button#missing`)).toBeNull();
  });

  it('returns null (never throws) on a malformed segment', () => {
    document.body.innerHTML = `<div id="app"></div>`;
    expect(resolveSelector(document, `div#app >>> :::bad`)).toBeNull();
  });
});

describe('engine.generate — shadow gating', () => {
  it('emits NO delimiter for a flat element even when shadowDomEnabled is true', () => {
    document.body.innerHTML = `<section id="hero"><button>x</button></section>`;
    const engine = createSelectorEngine(shadowConfig());
    const target = document.querySelector('button') as Element;
    const selector = engine.generate(target);
    expect(selector).not.toContain(SHADOW_BOUNDARY_DELIMITER);
    expect(selector).toBe('section#hero > button:nth-of-type(1)');
  });

  it('does NOT pierce when shadowDomEnabled is false (off path: single segment)', () => {
    document.body.innerHTML = `<div id="app"><my-card></my-card></div>`;
    const card = document.querySelector('my-card') as Element;
    const root = attachOpen(card, `<button id="cta">x</button>`);
    const cta = root.getElementById('cta') as Element;

    // Engine enabled, shadow OFF → selector is generated within the element's
    // own tree only, with no boundary delimiter (today's behavior).
    const engine = createSelectorEngine(resolveSelectorConfig({ enabled: true, shadowDomEnabled: false }));
    expect(engine.generate(cta)).not.toContain(SHADOW_BOUNDARY_DELIMITER);
  });

  it('pierces on the legacy path too (shadow on, engine enabled=false)', () => {
    document.body.innerHTML = `<div id="app"><my-card></my-card></div>`;
    const card = document.querySelector('my-card') as Element;
    const root = attachOpen(card, `<button id="cta">x</button>`);
    const cta = root.getElementById('cta') as Element;

    const engine = createSelectorEngine(resolveSelectorConfig({ enabled: false, shadowDomEnabled: true }));
    const selector = engine.generate(cta);
    expect(selector).toContain(SHADOW_BOUNDARY_DELIMITER);
    expect(resolveSelector(document, selector)).toBe(cta);
  });
});
