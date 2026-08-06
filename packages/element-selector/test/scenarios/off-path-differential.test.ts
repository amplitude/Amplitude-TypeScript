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
import { SHADOW_BOUNDARY_DELIMITER } from '../../src/helpers/shadow';

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
