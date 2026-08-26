/**
 * @jest-environment jsdom
 */

/**
 * Kill-switch differential guard.
 *
 * The shadow-DOM feature must be a strict no-op when `shadowDomEnabled` is
 * false — the byte-for-byte output the engine shipped before shadow support.
 * These tests prove the flag is the ONLY thing that changes behavior:
 *
 *   1. Over a corpus (including DOMs that contain shadow roots), the selector
 *      produced with the flag *absent* (default) is identical to the flag
 *      *explicitly false*, and never contains the shadow boundary delimiter —
 *      on both the v1 engine path (`enabled: true`) and the legacy kill-switch
 *      path (`enabled: false`).
 *   2. For a target that actually lives inside a shadow root, the flag is a
 *      real switch: OFF yields a single-tree selector with no delimiter; ON
 *      yields a delimited, boundary-crossing selector.
 *
 * If a future change lets shadow logic leak into the off path, #1 fails.
 */
import { createSelectorEngine } from '../../src/engine';
import { resolveSelectorConfig } from '../../src/config/resolve-config';
import { legacyCssPath } from '../../src/legacy-css-path';
import { SHADOW_BOUNDARY_DELIMITER, SHADOW_CHILD_CHAIN_PREFIX, resolveSelector } from '../../src/helpers/shadow';

interface Fixture {
  name: string;
  /** Builds the DOM and returns the target element. */
  build: () => Element;
}

const FIXTURES: Fixture[] = [
  {
    name: 'plain-semantic-html',
    build: () => {
      document.body.innerHTML = `<section id="hero"><div><button>Sign up</button></div></section>`;
      return document.querySelector('button') as Element;
    },
  },
  {
    name: 'walk-to-root-no-id',
    build: () => {
      document.body.innerHTML = `<div><button>Click</button></div>`;
      return document.querySelector('button') as Element;
    },
  },
  {
    name: 'target-inside-open-shadow-root',
    build: () => {
      document.body.innerHTML = `<div id="app"><my-host></my-host></div>`;
      const host = document.querySelector('my-host') as Element;
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<button id="cta">x</button>`;
      return root.getElementById('cta') as Element;
    },
  },
  {
    name: 'target-inside-nested-shadow-root',
    build: () => {
      document.body.innerHTML = `<my-card></my-card>`;
      const cardRoot = (document.querySelector('my-card') as Element).attachShadow({ mode: 'open' });
      cardRoot.innerHTML = `<my-button></my-button>`;
      const btnRoot = (cardRoot.querySelector('my-button') as Element).attachShadow({ mode: 'open' });
      btnRoot.innerHTML = `<button id="deep">x</button>`;
      return btnRoot.getElementById('deep') as Element;
    },
  },
];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('kill-switch differential — shadow flag is a strict no-op when off', () => {
  describe.each(FIXTURES)('[$name]', ({ build }) => {
    it('v1 path: flag-absent output === flag-explicitly-false output, no delimiter', () => {
      const target = build();
      const defaultEngine = createSelectorEngine(resolveSelectorConfig({ enabled: true }));
      const explicitOffEngine = createSelectorEngine(resolveSelectorConfig({ enabled: true, shadowDomEnabled: false }));

      const fromDefault = defaultEngine.generate(target);
      const fromExplicitOff = explicitOffEngine.generate(target);

      expect(fromExplicitOff).toBe(fromDefault);
      expect(fromDefault).not.toContain(SHADOW_BOUNDARY_DELIMITER);
    });

    it('legacy path (enabled:false): no delimiter, flag makes no difference', () => {
      const target = build();
      const legacy = createSelectorEngine(resolveSelectorConfig({ enabled: false }));
      const legacyExplicitOff = createSelectorEngine(
        resolveSelectorConfig({ enabled: false, shadowDomEnabled: false }),
      );

      const a = legacy.generate(target);
      const b = legacyExplicitOff.generate(target);

      expect(a).toBe(b);
      expect(a).not.toContain(SHADOW_BOUNDARY_DELIMITER);
    });
  });
});

describe('kill-switch differential — the full 2×2 of the two flags', () => {
  // Only the shadow flag may change output; `enabled` selects the algorithm.
  // With shadow OFF, neither combination may emit shadow-era syntax.
  const OFF_COMBOS = [
    { name: 'engine on, shadow off', enabled: true },
    { name: 'engine off (legacy), shadow off', enabled: false },
  ];

  describe.each(FIXTURES)('[$name]', ({ build }) => {
    it.each(OFF_COMBOS)('$name emits no shadow-era syntax', ({ enabled }) => {
      const target = build();
      const engine = createSelectorEngine(resolveSelectorConfig({ enabled, shadowDomEnabled: false }));
      const selector = engine.generate(target);

      expect(selector).not.toContain(SHADOW_BOUNDARY_DELIMITER);
      expect(selector).not.toContain(SHADOW_CHILD_CHAIN_PREFIX);
    });
  });
});

/**
 * The `options.scope` dimension. The dashboard tagging UI and the extension
 * construct an engine with an explicit scope, which for a shadow-nested target
 * is a `ShadowRoot`. That is the one input where shadow-aware code could change
 * off-path output without the flag being on: `fallbackCssPath` anchoring and
 * `positionalStep`'s shadow-sibling counting both key off the scope, not the
 * element. Both are gated on `shadowDomEnabled`, and these tests hold that line.
 */
describe('kill-switch differential — an explicit ShadowRoot scope with the flag off', () => {
  interface ShadowFixture {
    target: Element;
    root: ShadowRoot;
  }

  /** Target with no id anywhere on its chain → the pure-positional worst case. */
  function buildIdless(): ShadowFixture {
    document.body.innerHTML = `<my-host></my-host>`;
    const host = document.querySelector('my-host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<div><button>decoy</button></div><button>target</button>`;
    return { target: root.querySelectorAll('button')[1] as Element, root };
  }

  it('legacy path output is byte-identical to legacyCssPath', () => {
    const { target, root } = buildIdless();
    const engine = createSelectorEngine(resolveSelectorConfig({ enabled: false, shadowDomEnabled: false }), {
      scope: root,
    });

    expect(engine.generate(target)).toBe(legacyCssPath(target));
  });

  it('v1 path emits no shadow-era syntax', () => {
    const { target, root } = buildIdless();
    const engine = createSelectorEngine(resolveSelectorConfig({ enabled: true, shadowDomEnabled: false }), {
      scope: root,
    });
    const selector = engine.generate(target);

    expect(selector).not.toContain(SHADOW_BOUNDARY_DELIMITER);
    expect(selector).not.toContain(SHADOW_CHILD_CHAIN_PREFIX);
  });

  it('a shadow-root-top element still gets the pre-shadow bare-tag step', () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const host = document.querySelector('my-host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    // Two same-tag top-level siblings: shadow-aware stepping would number them.
    root.innerHTML = `<div></div><div></div>`;
    const target = root.children[1];

    const engine = createSelectorEngine(resolveSelectorConfig({ enabled: true, shadowDomEnabled: false }), {
      scope: root,
    });

    expect(engine.generate(target)).toBe('div');
  });
});

describe('kill-switch differential — flag ON is the only thing that pierces', () => {
  it('a shadow-nested target gets a delimited selector ONLY when the flag is on', () => {
    document.body.innerHTML = `<div id="app"><my-host></my-host></div>`;
    const host = document.querySelector('my-host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<button id="cta">x</button>`;
    const target = root.getElementById('cta') as Element;

    const off = createSelectorEngine(resolveSelectorConfig({ enabled: true, shadowDomEnabled: false }));
    const on = createSelectorEngine(
      resolveSelectorConfig({ enabled: true, shadowDomEnabled: true, maxShadowDomDepth: 2 }),
    );

    expect(off.generate(target)).not.toContain(SHADOW_BOUNDARY_DELIMITER);
    expect(on.generate(target)).toContain(SHADOW_BOUNDARY_DELIMITER);
  });
});

/**
 * The on-path contract: whatever `generate` emits with piercing on must
 * re-resolve to the element it came from. `resolveSelector` is the inverse the
 * dashboard and the extension are expected to use — a raw `querySelector` on a
 * delimited selector throws — so this round trip is the guarantee consumers
 * depend on. Runs on both algorithms over the whole corpus, flat DOMs included.
 */
describe('on-path round trip — generate → resolveSelector recovers the target', () => {
  describe.each(FIXTURES)('[$name]', ({ build }) => {
    it.each([
      { name: 'v1 engine', enabled: true },
      { name: 'legacy', enabled: false },
    ])('$name path round-trips', ({ enabled }) => {
      const target = build();
      const engine = createSelectorEngine(
        // Depth well above the corpus's deepest nesting so nothing truncates —
        // truncation is a documented best-effort case, covered separately.
        resolveSelectorConfig({ enabled, shadowDomEnabled: true, maxShadowDomDepth: 10 }),
      );

      expect(resolveSelector(document, engine.generate(target))).toBe(target);
    });
  });
});
