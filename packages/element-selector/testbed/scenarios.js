/**
 * Testbed scenarios — mirror of the differential corpus in `test/scenarios/`.
 *
 * Kept in sync with `test/scenarios/engine.scenarios.test.ts` by hand for now;
 * the two files share an HTML/expected pair per fixture. The test file is the
 * authoritative regression guard; this one exists so the testbed page doesn't
 * need a TypeScript build step.
 *
 * Each entry:
 *   - name:             short slug used as the section id
 *   - exercises:        plain-English description of what this scenario probes
 *   - html:             self-contained HTML, dropped straight into a sandbox
 *                       container in the page
 *   - targetSelector:   CSS selector finding the target element within the
 *                       rendered fragment; the testbed highlights this element
 *                       and uses `engine.generate(target)` against it
 *   - expectedSelector: what the engine should emit. Shown next to the live
 *                       emission so you can spot regressions at a glance.
 */
export const SCENARIOS = [
  {
    name: 'plain-semantic-html',
    exercises: 'Baseline — id on an ancestor, descent via nth-of-type',
    html: `
      <section id="hero">
        <div>
          <button>Sign up</button>
        </div>
      </section>
    `,
    targetSelector: 'button',
    expectedSelector: 'section#hero > div:nth-of-type(1) > button:nth-of-type(1)',
  },
  {
    name: 'explicit-tracking-attribute-on-target',
    exercises: 'explicitTrackingAttribute strategy wins over everything',
    html: `<section id="hero"><button data-amp-track-id="signup-cta">Sign up</button></section>`,
    targetSelector: 'button',
    expectedSelector: '[data-amp-track-id="signup-cta"]',
  },
  {
    name: 'explicit-tracking-attribute-on-ancestor',
    exercises: 'Explicit anchor walked up; descent assembled via describeRelative',
    html: `
      <section data-amp-track-id="signup-section">
        <div><button>Sign up</button></div>
      </section>
    `,
    targetSelector: 'button',
    expectedSelector: '[data-amp-track-id="signup-section"] > div:nth-of-type(1) > button:nth-of-type(1)',
  },
  {
    name: 'react-useid-filtered',
    exercises: 'React useId pattern (:r5:) filtered; walk continues to stable ancestor',
    html: `
      <section id="hero">
        <div id=":r5:">
          <button id=":r6:">Submit</button>
        </div>
      </section>
    `,
    targetSelector: 'button',
    expectedSelector: 'section#hero > div:nth-of-type(1) > button:nth-of-type(1)',
  },
  {
    name: 'radix-id-filtered',
    exercises: 'Radix-prefixed ids filtered (broader than colon-suffixed forms)',
    html: `
      <main id="content">
        <div id="radix-1B2C3D">
          <button>Open</button>
        </div>
      </main>
    `,
    targetSelector: 'button',
    expectedSelector: 'main#content > div:nth-of-type(1) > button:nth-of-type(1)',
  },
  {
    name: 'swiper-carousel-slide',
    exercises: 'Swiper state classes filtered; third slide identified by position not state',
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
    targetSelector: '.swiper-slide-next',
    expectedSelector: 'section#featured > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3)',
  },
  {
    name: 'rooms-to-go-product-carousel',
    exercises:
      "Stripped-down version of the Rooms To Go featured-products carousel — combines the two v1 wins in one DOM: a Swiper wrapper id with a long random suffix (caught by the 4+-digit-run autogen pattern) AND swiper-slide-active/swiper-slide-next state classes that move between elements as the carousel scrolls.",
    html: `
      <section id="featured-products">
        <div class="swiper">
          <div class="swiper-wrapper" id="swiper-wrapper-2e110fa710fd7e41039">
            <div class="swiper-slide">
              <button class="btn-cart">Add to cart</button>
            </div>
            <div class="swiper-slide swiper-slide-active">
              <button class="btn-cart">Add to cart</button>
            </div>
            <div class="swiper-slide swiper-slide-next">
              <button class="btn-cart">Add to cart</button>
            </div>
          </div>
        </div>
      </section>
    `,
    targetSelector: '.swiper-slide-next .btn-cart',
    expectedSelector:
      'section#featured-products > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(1)',
  },
  {
    name: 'swiper-carousel-prev-slide',
    exercises:
      "Swiper carousel after a user scroll — the same DOM but with prev/active/next state classes shifted onto different slides. Demonstrates that the v1 selector for the same button stays consistent regardless of which Swiper state class is currently attached, while legacy emits a different selector after every scroll because it anchors on the volatile swiper-wrapper id + state classes.",
    html: `
      <section id="featured-products">
        <div class="swiper">
          <div class="swiper-wrapper" id="swiper-wrapper-a9b8c7d6e5f4321b3">
            <div class="swiper-slide swiper-slide-prev">
              <button class="btn-cart">Slide 1</button>
            </div>
            <div class="swiper-slide swiper-slide-active">
              <button class="btn-cart">Slide 2</button>
            </div>
            <div class="swiper-slide swiper-slide-next">
              <button class="btn-cart">Slide 3</button>
            </div>
          </div>
        </div>
      </section>
    `,
    targetSelector: '.swiper-slide-prev .btn-cart',
    expectedSelector:
      'section#featured-products > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > button:nth-of-type(1)',
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
    targetSelector: 'button.Mui-selected',
    expectedSelector: 'nav#primary-nav > button:nth-of-type(2)',
  },
  {
    name: 'tailwind-utility-soup',
    exercises: 'Tailwind utility classes ignored; positional descent only',
    html: `
      <header id="masthead">
        <div class="flex items-center justify-between px-4 py-2 bg-blue-500 text-white">
          <a class="text-lg font-semibold hover:underline" href="/">Brand</a>
          <button class="rounded-md p-2 hover:bg-blue-600 active:bg-blue-700">Menu</button>
        </div>
      </header>
    `,
    targetSelector: 'button',
    expectedSelector: 'header#masthead > div:nth-of-type(1) > button:nth-of-type(1)',
  },
  {
    name: 'tailwind-arbitrary-variants',
    exercises: 'Tailwind arbitrary-syntax variants (data-[…]:, [&_.foo]:) filtered',
    html: `
      <section id="dropdown">
        <button class="data-[state=open]:bg-white [&_.swiper-slide]:h-auto" data-state="open">Toggle</button>
      </section>
    `,
    targetSelector: 'button',
    expectedSelector: 'section#dropdown > button:nth-of-type(1)',
  },
  {
    name: 'css-in-js-hashes',
    exercises: 'Emotion, styled-components, CSS modules, styled-jsx hashes filtered',
    html: `
      <main id="app">
        <article class="css-1abcd23 sc-bdVaJa jsx-1234567 Button_root__abc123">
          <button>Read more</button>
        </article>
      </main>
    `,
    targetSelector: 'button',
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
    targetSelector: 'button',
    expectedSelector: 'section#hero > button:nth-of-type(1)',
  },
  {
    name: 'walk-to-root-when-no-id-available',
    exercises: 'No id anywhere → fallback walks rooted at the sandbox container',
    html: `<div><button>Click</button></div>`,
    targetSelector: 'button',
    // Note: when rendered inside a sandbox <div id="..."> in the testbed, the
    // fallback terminates at that container's id rather than walking to <html>
    // — that's why the expected here is shorter than the Jest scenario's.
    // The testbed.js compares against `engine.generate(target)`'s actual
    // output rather than this static string for this scenario; the field is
    // kept for documentation.
    expectedSelector: '(testbed-relative — see live output)',
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
    targetSelector: 'li:nth-of-type(4) a',
    expectedSelector: 'ul#menu > li:nth-of-type(4) > a:nth-of-type(1)',
  },
];
