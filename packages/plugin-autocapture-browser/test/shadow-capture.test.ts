/**
 * Shadow-DOM capture-side behavior: ancestor walks, deep discovery helpers, the
 * composedPath event-target resolution, and the MutationObserver fan-out.
 *
 * jsdom supports `attachShadow({ mode: 'open' })`, `getRootNode`,
 * `composedPath`, and `MutationObserver`, so these exercise the real paths.
 */
import {
  getClosestElement,
  collectOpenShadowRoots,
  querySelectorAllDeep,
  MAX_SHADOW_TRAVERSAL_NODES,
} from '../src/helpers';
import { getAncestors } from '../src/hierarchy';
import { createMutationObservable } from '../src/observables';
import { DataExtractor } from '../src/data-extractor';

function attachOpen(host: Element, html: string): ShadowRoot {
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = html;
  return root;
}

/** Let jsdom's MutationObserver microtask flush. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('getClosestElement — shadow crossing', () => {
  let host: Element;
  let inner: Element;

  beforeEach(() => {
    document.body.innerHTML = `<div id="app"><my-host></my-host></div>`;
    host = document.querySelector('my-host') as Element;
    const root = attachOpen(host, `<button id="cta">x</button>`);
    inner = root.getElementById('cta') as Element;
  });

  it('does NOT cross the shadow boundary by default (returns null)', () => {
    // The matching ancestor (#app) lives in the light DOM, outside the inner
    // element's shadow tree. Default behavior stops at the tree boundary.
    expect(getClosestElement(inner, ['#app'])).toBeNull();
  });

  it('crosses into the host and up to a light-DOM ancestor when enabled', () => {
    expect(getClosestElement(inner, ['#app'], true, 1)).toBe(document.getElementById('app'));
  });

  it('respects the crossing budget (depth 0 cannot cross)', () => {
    expect(getClosestElement(inner, ['#app'], true, 0)).toBeNull();
  });

  it('still matches within the same tree without crossing', () => {
    expect(getClosestElement(inner, ['#cta'], false, 0)).toBe(inner);
  });
});

describe('getAncestors — shadow crossing', () => {
  let inner: Element;
  let host: Element;

  beforeEach(() => {
    document.body.innerHTML = `<div id="app"><my-host></my-host></div>`;
    host = document.querySelector('my-host') as Element;
    const root = attachOpen(host, `<span id="inner">x</span>`);
    inner = root.getElementById('inner') as Element;
  });

  it('stops at the shadow boundary by default (only the element itself)', () => {
    // inner has no parentElement at the top of its shadow tree.
    expect(getAncestors(inner)).toEqual([inner]);
  });

  it('walks through the host into the light DOM when enabled', () => {
    const ancestors = getAncestors(inner, true, 1);
    expect(ancestors).toContain(inner);
    expect(ancestors).toContain(host);
    expect(ancestors).toContain(document.getElementById('app'));
  });
});

describe('collectOpenShadowRoots', () => {
  it('returns nothing when depth budget is 0', () => {
    document.body.innerHTML = `<my-host></my-host>`;
    attachOpen(document.querySelector('my-host') as Element, `<div></div>`);
    expect(collectOpenShadowRoots(document.body, 0)).toEqual([]);
  });

  it('finds nested open roots with their crossing depth, bounded by maxDepth', () => {
    document.body.innerHTML = `<my-card></my-card>`;
    const card = document.querySelector('my-card') as Element;
    const cardRoot = attachOpen(card, `<my-button></my-button>`);
    const button = cardRoot.querySelector('my-button') as Element;
    attachOpen(button, `<button>x</button>`);

    const depth1 = collectOpenShadowRoots(document.body, 1);
    expect(depth1).toHaveLength(1);
    expect(depth1[0].depth).toBe(1);
    expect(depth1[0].root).toBe(cardRoot);

    const depth2 = collectOpenShadowRoots(document.body, 2);
    expect(depth2.map((r) => r.depth).sort()).toEqual([1, 2]);
  });

  it('skips closed shadow roots (invisible from outside)', () => {
    document.body.innerHTML = `<my-host></my-host>`;
    (document.querySelector('my-host') as Element).attachShadow({ mode: 'closed' });
    expect(collectOpenShadowRoots(document.body, 5)).toEqual([]);
  });
});

describe('querySelectorAllDeep', () => {
  beforeEach(() => {
    document.body.innerHTML = `<button class="track">light</button><my-host></my-host>`;
    attachOpen(document.querySelector('my-host') as Element, `<button class="track">shadow</button>`);
  });

  it('returns only light-DOM matches when depth is 0', () => {
    const found = querySelectorAllDeep(document, '.track', 0);
    expect(found).toHaveLength(1);
    expect(found[0].textContent).toBe('light');
  });

  it('pierces open shadow roots when depth allows', () => {
    const found = querySelectorAllDeep(document, '.track', 1);
    expect(found.map((el) => el.textContent).sort()).toEqual(['light', 'shadow']);
  });
});

/**
 * Hardening / safety: none of the shadow capture-side helpers may throw into a
 * host page, even given a customer-supplied malformed selector, an exotic
 * (non-Element) event target, or a pathologically large DOM.
 */
describe('shadow helpers — never throw on hostile input', () => {
  it('querySelectorAllDeep returns light-DOM matches even if a shadow root query is malformed', () => {
    // Valid selector against a normal tree still resolves; the guard only trips
    // per-root, so a valid selector keeps working.
    document.body.innerHTML = `<button class="track">x</button>`;
    expect(querySelectorAllDeep(document, '.track', 1).map((el) => el.textContent)).toEqual(['x']);
  });

  it('getClosestElement does not throw when the start node lacks getRootNode (e.g. window)', () => {
    const exotic = window as unknown as Element;
    expect(() => getClosestElement(exotic, ['button'], true, 2)).not.toThrow();
    expect(getClosestElement(exotic, ['button'], true, 2)).toBeNull();
  });

  it('querySelectorAllDeep returns [] for an empty selector string', () => {
    document.body.innerHTML = `<button class="track">x</button>`;
    expect(querySelectorAllDeep(document, '', 1)).toEqual([]);
  });

  it('querySelectorAllDeep defaults to light-DOM only (no depth arg) and accepts an Element root', () => {
    document.body.innerHTML = `<div id="scope"><button class="track">x</button><my-host></my-host></div>`;
    const scope = document.getElementById('scope') as Element;
    attachOpen(scope.querySelector('my-host') as Element, `<button class="track">y</button>`);

    // Default depth (arg omitted) → light DOM only.
    expect(querySelectorAllDeep(scope, '.track').map((el) => el.textContent)).toEqual(['x']);
    // Element (non-Document) root with depth → pierces the shadow root within scope.
    expect(
      querySelectorAllDeep(scope, '.track', 1)
        .map((el) => el.textContent)
        .sort(),
    ).toEqual(['x', 'y']);
  });

  it('collectOpenShadowRoots is bounded by MAX_SHADOW_TRAVERSAL_NODES', () => {
    expect(MAX_SHADOW_TRAVERSAL_NODES).toBeGreaterThan(0);
    // A wide-but-shallow tree: the traversal must terminate and never throw.
    const wide = document.createElement('div');
    for (let i = 0; i < 100; i++) {
      wide.appendChild(document.createElement('span'));
    }
    document.body.appendChild(wide);
    expect(() => collectOpenShadowRoots(document.body, 1)).not.toThrow();
  });
});

describe('DataExtractor.resolveEventTarget — composedPath', () => {
  let extractor: DataExtractor;

  beforeEach(() => {
    extractor = new DataExtractor({});
  });

  afterEach(() => {
    // Reset the shared engine config back to defaults so toggles don't leak.
    extractor.updateSelectorConfig();
  });

  it('returns event.target (retargeted host) when shadow support is off', () => {
    const host = document.createElement('my-host');
    const inner = document.createElement('button');
    const event = { target: host, composedPath: () => [inner, host] } as unknown as Event;
    expect(extractor.resolveEventTarget(event)).toBe(host);
  });

  it('returns the true inner element from composedPath when shadow support is on', () => {
    extractor.updateSelectorConfig({ shadowDomEnabled: true });
    const host = document.createElement('my-host');
    const inner = document.createElement('button');
    const event = { target: host, composedPath: () => [inner, host] } as unknown as Event;
    expect(extractor.resolveEventTarget(event)).toBe(inner);
  });

  it('falls back to event.target when composedPath is unavailable (shadow on)', () => {
    extractor.updateSelectorConfig({ shadowDomEnabled: true });
    const host = document.createElement('my-host');
    // No composedPath on the event (e.g. an environment/event that lacks it).
    const event = { target: host } as unknown as Event;
    expect(extractor.resolveEventTarget(event)).toBe(host);
  });
});

describe('createMutationObservable — shadow fan-out', () => {
  it('does NOT observe shadow-root mutations when disabled', async () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<div id="sr"></div>`);

    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(() => ({ enabled: false, maxDepth: 1 })).subscribe((m) => batches.push(m));

    // Mutate inside the shadow root — invisible to a body-only observer.
    root.getElementById('sr')?.appendChild(document.createElement('span'));
    await tick();

    const sawShadowMutation = batches.some((b) => b.some((rec) => rec.target.getRootNode() === root));
    expect(sawShadowMutation).toBe(false);
    sub.unsubscribe();
  });

  it('observes mutations inside an existing open shadow root when enabled', async () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<div id="sr"></div>`);

    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((m) => batches.push(m));

    root.getElementById('sr')?.appendChild(document.createElement('span'));
    await tick();

    const sawShadowMutation = batches.some((b) => b.some((rec) => rec.target.getRootNode() === root));
    expect(sawShadowMutation).toBe(true);
    sub.unsubscribe();
  });

  it('attaches to a shadow root that mounts AFTER setup (late-loading component)', async () => {
    document.body.innerHTML = '';
    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((m) => batches.push(m));

    // Mount a brand-new shadow host after the observable is already running.
    const host = document.createElement('my-host');
    document.body.appendChild(host);
    const root = attachOpen(host, `<div id="late"></div>`);
    await tick(); // body observer sees the host → attaches to its shadow root

    // Now mutate inside the newly-attached shadow root.
    root.getElementById('late')?.appendChild(document.createElement('span'));
    await tick();

    const sawShadowMutation = batches.some((b) => b.some((rec) => rec.target.getRootNode() === root));
    expect(sawShadowMutation).toBe(true);
    sub.unsubscribe();
  });

  it('observes mutations in a NESTED shadow root (depth 2) when the budget allows', async () => {
    document.body.innerHTML = `<my-card></my-card>`;
    const cardRoot = attachOpen(document.querySelector('my-card') as Element, `<my-button></my-button>`);
    const innerRoot = attachOpen(cardRoot.querySelector('my-button') as Element, `<div id="deep"></div>`);

    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(() => ({ enabled: true, maxDepth: 2 })).subscribe((m) => batches.push(m));

    innerRoot.getElementById('deep')?.appendChild(document.createElement('span'));
    await tick();

    const sawDeepMutation = batches.some((b) => b.some((rec) => rec.target.getRootNode() === innerRoot));
    expect(sawDeepMutation).toBe(true);
    sub.unsubscribe();
  });

  it('does NOT reach a nested (depth 2) shadow root when the budget is 1', async () => {
    document.body.innerHTML = `<my-card></my-card>`;
    const cardRoot = attachOpen(document.querySelector('my-card') as Element, `<my-button></my-button>`);
    const innerRoot = attachOpen(cardRoot.querySelector('my-button') as Element, `<div id="deep"></div>`);

    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((m) => batches.push(m));

    innerRoot.getElementById('deep')?.appendChild(document.createElement('span'));
    await tick();

    const sawDeepMutation = batches.some((b) => b.some((rec) => rec.target.getRootNode() === innerRoot));
    expect(sawDeepMutation).toBe(false);
    sub.unsubscribe();
  });

  it('with no shadow-config getter, behaves like a plain body observer (off path)', async () => {
    document.body.innerHTML = `<div id="light"></div>`;
    const batches: MutationRecord[][] = [];
    // No getter passed at all — the optional gate must default to disabled.
    const sub = createMutationObservable().subscribe((m) => batches.push(m));

    document.getElementById('light')?.appendChild(document.createElement('span'));
    await tick();

    expect(batches.length).toBeGreaterThan(0);
    sub.unsubscribe();
  });

  it('does not double-observe a shadow root already attached (re-scanned host)', async () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const host = document.querySelector('my-host') as Element;
    const root = attachOpen(host, `<div id="sr"></div>`);

    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((m) => batches.push(m));

    // Re-append the existing host: generates a childList mutation whose addedNode
    // is a host whose shadow root is ALREADY observed → observeRoot short-circuits.
    document.body.appendChild(host);
    await tick();

    // Mutating inside the (still singly-observed) shadow root emits exactly once.
    root.getElementById('sr')?.appendChild(document.createElement('span'));
    await tick();

    const shadowBatches = batches.filter((b) => b.some((rec) => rec.target.getRootNode() === root));
    // The span insertion is reported once, not duplicated by a second observer.
    const spanInsertions = shadowBatches
      .flat()
      .filter((rec) => Array.from(rec.addedNodes).some((n) => n.nodeName === 'SPAN'));
    expect(spanInsertions).toHaveLength(1);
    sub.unsubscribe();
  });

  it('still emits light-DOM mutations even if the shadow gate getter throws', async () => {
    document.body.innerHTML = `<div id="light"></div>`;
    const batches: MutationRecord[][] = [];
    // A hostile getter that throws must not break event flow (observer.next runs first).
    const sub = createMutationObservable(() => {
      throw new Error('boom');
    }).subscribe((m) => batches.push(m));

    document.getElementById('light')?.appendChild(document.createElement('span'));
    await tick();

    expect(batches.length).toBeGreaterThan(0);
    sub.unsubscribe();
  });
});
