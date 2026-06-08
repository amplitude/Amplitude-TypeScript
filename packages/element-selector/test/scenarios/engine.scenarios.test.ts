/**
 * @jest-environment jsdom
 */

/**
 * Differential scenarios corpus.
 *
 * Each fixture stores the input DOM and the expected selector that
 * `createSelectorEngine(...).generate(target)` should produce. A parameterized
 * test runs every fixture and asserts the output matches the snapshot.
 *
 * This is the regression guard for the engine: a strategy tweak or pattern
 * change that silently shifts the selector format for ANY of these scenarios
 * will fail CI. The corpus is intentionally diverse — it draws from the same
 * scenarios that drove the v1 design (Swiper, MUI, Tailwind, semantic HTML)
 * plus a few synthetic edge cases.
 *
 * Adding a new scenario:
 *   1. Add a fixture object to SCENARIOS below
 *   2. Set `expectedSelector` to whatever the engine actually produces today
 *      (run the test once, copy the actual into expected, verify by hand
 *      that it's reasonable)
 *   3. Keep the fixture's DOM HTML self-contained — no shared state between
 *      scenarios
 */

import { createSelectorEngine } from '../../src/engine';
import { resolveSelectorConfig } from '../../src/config/resolve-config';

interface Scenario {
  /** Short name shown in test output. */
  name: string;
  /** Human-readable note about what this scenario exercises. */
  exercises: string;
  /** Self-contained HTML — replaces document.body.innerHTML. */
  html: string;
  /** CSS selector identifying the target element within the rendered DOM. */
  targetQuery: string;
  /** The selector the engine is expected to emit for the target. */
  expectedSelector: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'plain-semantic-html',
    exercises: 'baseline — id on an ancestor, descent via nth-of-type',
    html: `
      <section id="hero">
        <div>
          <button>Sign up</button>
        </div>
      </section>
    `,
    targetQuery: 'button',
    expectedSelector: 'section#hero > div:nth-of-type(1) > button:nth-of-type(1)',
  },

  {
    name: 'explicit-tracking-attribute-on-target',
    exercises: 'explicitTrackingAttribute strategy wins over everything',
    html: `<section id="hero"><button data-amp-track-id="signup-cta">Sign up</button></section>`,
    targetQuery: 'button',
    expectedSelector: '[data-amp-track-id="signup-cta"]',
  },

  {
    name: 'explicit-tracking-attribute-on-ancestor',
    exercises: 'explicit anchor walked up, descent assembled via describeRelative',
    html: `
      <section data-amp-track-id="signup-section">
        <div><button>Sign up</button></div>
      </section>
    `,
    targetQuery: 'button',
    expectedSelector: '[data-amp-track-id="signup-section"] > div:nth-of-type(1) > button:nth-of-type(1)',
  },

  {
    name: 'react-useid-filtered',
    exercises: 'React useId pattern (:r5:) is filtered, walk continues to stable ancestor',
    html: `
      <section id="hero">
        <div id=":r5:">
          <button id=":r6:">Submit</button>
        </div>
      </section>
    `,
    targetQuery: 'button',
    expectedSelector: 'section#hero > div:nth-of-type(1) > button:nth-of-type(1)',
  },

  {
    name: 'radix-id-filtered',
    exercises: 'Radix-prefixed ids are filtered (broader than just colon-suffixed forms)',
    html: `
      <main id="content">
        <div id="radix-1B2C3D">
          <button>Open</button>
        </div>
      </main>
    `,
    targetQuery: 'button',
    expectedSelector: 'main#content > div:nth-of-type(1) > button:nth-of-type(1)',
  },

  {
    name: 'swiper-carousel-slide',
    exercises: 'Swiper state classes filtered, third slide identified by position not state',
    html: `
      <section id="featured">
        <div class="swiper">
          <div class="swiper-wrapper">
            <div class="swiper-slide">Slide 1</div>
            <div class="swiper-slide swiper-slide-active">Slide 2</div>
            <div class="swiper-slide swiper-slide-next">Slide 3</div>
          </div>
        </div>
      </section>
    `,
    targetQuery: '.swiper-slide-next',
    expectedSelector: 'section#featured > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3)',
  },

  {
    name: 'mui-button-state-classes',
    exercises: 'MUI focusVisible / selected state classes do not pollute the selector',
    html: `
      <nav id="primary-nav">
        <button class="MuiButton-root MuiButton-focusVisible">Home</button>
        <button class="MuiButton-root Mui-selected">Products</button>
        <button class="MuiButton-root">Pricing</button>
      </nav>
    `,
    targetQuery: 'button.Mui-selected',
    expectedSelector: 'nav#primary-nav > button:nth-of-type(2)',
  },

  {
    name: 'tailwind-utility-soup',
    exercises: 'Tailwind utility classes are ignored by the fallback; positional descent only',
    html: `
      <header id="masthead">
        <div class="flex items-center justify-between px-4 py-2 bg-blue-500 text-white">
          <a class="text-lg font-semibold hover:underline" href="/">Brand</a>
          <button class="rounded-md p-2 hover:bg-blue-600 active:bg-blue-700">Menu</button>
        </div>
      </header>
    `,
    targetQuery: 'button',
    expectedSelector: 'header#masthead > div:nth-of-type(1) > button:nth-of-type(1)',
  },

  {
    name: 'tailwind-arbitrary-variants',
    exercises: 'Tailwind arbitrary-syntax variants (data-[state=open]:, [&_.foo]:) are filtered',
    html: `
      <section id="dropdown">
        <button class="data-[state=open]:bg-white [&_.swiper-slide]:h-auto" data-state="open">Toggle</button>
      </section>
    `,
    targetQuery: 'button',
    expectedSelector: 'section#dropdown > button:nth-of-type(1)',
  },

  {
    name: 'css-in-js-hashes',
    exercises: 'Emotion, styled-components, CSS modules, styled-jsx hashes are filtered',
    html: `
      <main id="app">
        <article class="css-1abcd23 sc-bdVaJa jsx-1234567 Button_root__abc123">
          <button>Read more</button>
        </article>
      </main>
    `,
    targetQuery: 'button',
    expectedSelector: 'main#app > article:nth-of-type(1) > button:nth-of-type(1)',
  },

  {
    name: 'suppression-signal',
    exercises: 'Empty data-amp-track-id on the target suppresses anchoring on its id',
    html: `
      <section id="hero">
        <button id="dynamic-cta-1234" data-amp-track-id="">Buy</button>
      </section>
    `,
    targetQuery: 'button',
    expectedSelector: 'section#hero > button:nth-of-type(1)',
  },

  {
    name: 'walk-to-root-when-no-id-available',
    exercises: 'No id anywhere → fallback walks to <html>',
    html: `<div><button>Click</button></div>`,
    targetQuery: 'button',
    expectedSelector: 'html > body:nth-of-type(1) > div:nth-of-type(1) > button:nth-of-type(1)',
  },

  {
    name: 'siblings-positional-disambiguation',
    exercises: 'Multiple same-tag children → nth-of-type counts correctly',
    html: `
      <ul id="menu">
        <li><a>Home</a></li>
        <li><a>About</a></li>
        <li><a>Contact</a></li>
        <li><a>Blog</a></li>
      </ul>
    `,
    targetQuery: 'li:nth-of-type(4) a',
    expectedSelector: 'ul#menu > li:nth-of-type(4) > a:nth-of-type(1)',
  },
];

describe('engine scenarios — differential regression guard', () => {
  let engine: ReturnType<typeof createSelectorEngine>;

  beforeAll(() => {
    engine = createSelectorEngine(resolveSelectorConfig({ enabled: true }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  SCENARIOS.forEach((scenario) => {
    it(`[${scenario.name}] ${scenario.exercises}`, () => {
      document.body.innerHTML = scenario.html;
      const target = document.querySelector(scenario.targetQuery);
      expect(target).not.toBeNull();
      const selector = engine.generate(target as Element);
      expect(selector).toBe(scenario.expectedSelector);
    });
  });

  // Round-trip check: every emitted selector should resolve to exactly the
  // target element. This catches "we shipped a selector that looks reasonable
  // but doesn't actually match the target" regressions.
  SCENARIOS.forEach((scenario) => {
    it(`[${scenario.name}] round-trips — selector resolves back to the original target`, () => {
      document.body.innerHTML = scenario.html;
      const target = document.querySelector(scenario.targetQuery) as Element;
      const selector = engine.generate(target);
      expect(document.querySelector(selector)).toBe(target);
    });
  });
});
