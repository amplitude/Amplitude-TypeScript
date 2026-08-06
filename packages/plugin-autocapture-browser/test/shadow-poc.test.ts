/**
 * POC additions layered on top of the ported SR-4788 shadow-DOM work:
 *
 *   - `createChangeObservable`: change capture inside open shadow roots.
 *     `change` is composed:false and never leaves its shadow tree, so roots are
 *     discovered lazily from `focusin` (composed:true, always precedes a user
 *     change) and get their own capture listener.
 *   - `closestCrossShadow`: single-selector `closest` across open boundaries.
 *   - hierarchy: `shadow: true` boundary marker + sibling indexes for elements
 *     at the top of a shadow tree.
 *   - `matchEventToFilter`: hierarchy filters crossing shadow boundaries.
 *   - `updateSelectorConfig`: two-switch guard (`enabled` / `shadowDomEnabled`).
 *   - `autocapturePlugin({ shadowDomSupport })`: local opt-in without remote config.
 *   - `getText`: a mask directive on a shadow HOST masks shadow internals.
 */
import { autocapturePlugin } from '../src/autocapture-plugin';
import { createChangeObservable } from '../src/observables';
import { DataExtractor } from '../src/data-extractor';
import { closestCrossShadow } from '../src/helpers';
import { getElementProperties } from '../src/hierarchy';
import { matchEventToFilter } from '../src/pageActions/matchEventToFilter';
import {
  createTriggerEvaluator,
  createLabeledEventToTriggerMap,
  groupLabeledEventIdsByEventType,
  TriggerEvaluator,
} from '../src/pageActions/triggers';
import type { Filter } from '@amplitude/analytics-core/lib/esm/types/element-interactions';

/**
 * Reset/flip the shared selector engine's config. Every field is spelled out
 * because `updateSelectorConfig` deliberately ignores deliveries that carry
 * neither switch — `undefined` would be a no-op, not a reset.
 */
const setShadowConfig = (cfg?: { enabled?: boolean; shadowDomEnabled?: boolean; maxShadowDomDepth?: number }) => {
  new DataExtractor({}).updateSelectorConfig({
    enabled: false,
    shadowDomEnabled: false,
    maxShadowDomDepth: 1,
    ...(cfg ?? {}),
  });
};

const engineConfig = () => {
  const extractor = new DataExtractor({});
  return {
    shadowDomEnabled: extractor.isShadowDomEnabled(),
    maxShadowDomDepth: extractor.getMaxShadowDomDepth(),
  };
};

afterEach(() => {
  setShadowConfig(undefined);
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('closestCrossShadow', () => {
  const buildNestedShadow = () => {
    document.body.innerHTML = `<section class="zone"><div id="outer-host"></div></section>`;
    const outerHost = document.getElementById('outer-host') as Element;
    const outerRoot = outerHost.attachShadow({ mode: 'open' });
    outerRoot.innerHTML = `<div class="outer-wrap"><div id="inner-host"></div></div>`;
    const innerHost = outerRoot.getElementById('inner-host') as Element;
    const innerRoot = innerHost.attachShadow({ mode: 'open' });
    innerRoot.innerHTML = `<button id="btn">deep</button>`;
    return { button: innerRoot.getElementById('btn') as Element, outerRoot };
  };

  test('matches within the element own tree without any crossings', () => {
    const { button } = buildNestedShadow();
    expect(closestCrossShadow(button, 'button')).toBe(button);
  });

  test('returns null for a light-DOM ancestor selector when crossings are 0', () => {
    const { button } = buildNestedShadow();
    expect(closestCrossShadow(button, 'section.zone')).toBeNull();
  });

  test('crosses one boundary to match an ancestor in the enclosing tree', () => {
    const { button, outerRoot } = buildNestedShadow();
    expect(closestCrossShadow(button, '.outer-wrap', 1)).toBe(outerRoot.querySelector('.outer-wrap'));
  });

  test('needs two crossings to reach the light DOM from a doubly-nested tree', () => {
    const { button } = buildNestedShadow();
    expect(closestCrossShadow(button, 'section.zone', 1)).toBeNull();
    expect(closestCrossShadow(button, 'section.zone', 2)).toBe(document.querySelector('section.zone'));
  });

  test('returns null for a null element', () => {
    expect(closestCrossShadow(null, 'div', 5)).toBeNull();
  });

  test('degrades gracefully for exotic nodes without closest/getRootNode', () => {
    const exotic = {} as unknown as Element;
    expect(closestCrossShadow(exotic, 'div', 5)).toBeNull();
  });

  test('stops at the document root when no match exists anywhere', () => {
    const { button } = buildNestedShadow();
    expect(closestCrossShadow(button, '.no-such-ancestor', 10)).toBeNull();
  });
});

describe('hierarchy shadow-boundary marker', () => {
  test('marks a top-level shadow-tree element and indexes it against the root children', () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.getElementById('host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style></style><div id="first"></div><div id="second"></div>`;
    const second = root.getElementById('second') as Element;

    const props = getElementProperties(second, new Set<string>());
    expect(props).toMatchObject({ tag: 'div', id: 'second', shadow: true, index: 2, indexOfType: 1 });
  });

  test('does not mark light-DOM elements (existing hierarchies unchanged)', () => {
    document.body.innerHTML = `<div id="plain"></div>`;
    const plain = document.getElementById('plain') as Element;
    const props = getElementProperties(plain, new Set<string>());
    expect(props).not.toHaveProperty('shadow');
  });

  test('does not mark a nested (non-top) shadow-tree element', () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.getElementById('host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<div class="wrap"><button id="deep">x</button></div>`;
    const deep = root.getElementById('deep') as Element;
    expect(getElementProperties(deep, new Set<string>())).not.toHaveProperty('shadow');
  });
});

describe('createChangeObservable — shadow change capture', () => {
  const focusInto = (el: Element) => {
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
  };
  const changeOn = (el: Element, composed = false) => {
    el.dispatchEvent(new Event('change', { bubbles: true, composed }));
  };

  const buildShadowInput = () => {
    document.body.innerHTML = `<input id="light-input" /><div id="host"></div>`;
    const host = document.getElementById('host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<input id="shadow-input" />`;
    return {
      lightInput: document.getElementById('light-input') as HTMLInputElement,
      shadowInput: root.getElementById('shadow-input') as HTMLInputElement,
      root,
      host,
    };
  };

  test('emits document-level changes with no shadow config (prior behavior)', () => {
    const { lightInput, shadowInput } = buildShadowInput();
    const seen: Event[] = [];
    const sub = createChangeObservable().subscribe((e) => seen.push(e));
    // A focusin with no getter must be a silent no-op (no root discovery).
    focusInto(shadowInput);
    changeOn(lightInput);
    changeOn(shadowInput);
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });

  test('DISABLED: a change inside a shadow root is never seen (composed:false stops at the root)', () => {
    const { shadowInput } = buildShadowInput();
    const seen: Event[] = [];
    const sub = createChangeObservable(() => ({ enabled: false, maxDepth: 1 })).subscribe((e) => seen.push(e));
    focusInto(shadowInput);
    changeOn(shadowInput);
    expect(seen).toHaveLength(0);
    sub.unsubscribe();
  });

  test('ENABLED: focusin discovers the root, and the shadow change is emitted exactly once', () => {
    const { shadowInput, lightInput } = buildShadowInput();
    // Capture targets at emission time — jsdom clears event.target once
    // dispatch completes, so post-hoc reads see null.
    const seenTargets: (EventTarget | null)[] = [];
    const sub = createChangeObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((e) =>
      seenTargets.push(e.target),
    );

    focusInto(shadowInput);
    changeOn(shadowInput);
    expect(seenTargets).toEqual([shadowInput]);

    // Light-DOM changes still flow through the document listener.
    changeOn(lightInput);
    expect(seenTargets).toEqual([shadowInput, lightInput]);
    sub.unsubscribe();
  });

  test('ENABLED: repeated focusin does not double-attach (still one emission per change)', () => {
    const { shadowInput } = buildShadowInput();
    const seen: Event[] = [];
    const sub = createChangeObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((e) => seen.push(e));
    focusInto(shadowInput);
    focusInto(shadowInput);
    changeOn(shadowInput);
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });

  test('ENABLED: a root deeper than maxDepth is not attached', () => {
    document.body.innerHTML = `<div id="outer"></div>`;
    const outerRoot = (document.getElementById('outer') as Element).attachShadow({ mode: 'open' });
    outerRoot.innerHTML = `<div id="inner"></div>`;
    const innerRoot = (outerRoot.getElementById('inner') as Element).attachShadow({ mode: 'open' });
    innerRoot.innerHTML = `<input id="deep-input" />`;
    const deepInput = innerRoot.getElementById('deep-input') as HTMLInputElement;

    const seen: Event[] = [];
    const sub = createChangeObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((e) => seen.push(e));
    focusInto(deepInput); // inner root is at depth 2 — over budget; outer root attaches.
    changeOn(deepInput); // non-composed: stops at the (unattached) inner root.
    expect(seen).toHaveLength(0);
    sub.unsubscribe();
  });

  test('a synthetic composed change from a nested tree is emitted exactly once (innermost owner wins)', () => {
    document.body.innerHTML = `<div id="outer"></div>`;
    const outerRoot = (document.getElementById('outer') as Element).attachShadow({ mode: 'open' });
    outerRoot.innerHTML = `<div id="inner"></div>`;
    const innerRoot = (outerRoot.getElementById('inner') as Element).attachShadow({ mode: 'open' });
    innerRoot.innerHTML = `<input id="deep-input" />`;
    const deepInput = innerRoot.getElementById('deep-input') as HTMLInputElement;

    const seen: Event[] = [];
    const sub = createChangeObservable(() => ({ enabled: true, maxDepth: 2 })).subscribe((e) => seen.push(e));
    focusInto(deepInput); // attaches BOTH roots (depths 1 and 2)
    changeOn(deepInput, true); // composed — passes inner root, outer root, and document
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });

  test('unsubscribe detaches the per-root listeners', () => {
    const { shadowInput } = buildShadowInput();
    const seen: Event[] = [];
    const sub = createChangeObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((e) => seen.push(e));
    focusInto(shadowInput);
    sub.unsubscribe();
    changeOn(shadowInput);
    expect(seen).toHaveLength(0);
  });

  test('a composed change from an UNdiscovered root falls back to the document listener (no focus/click first)', () => {
    const { shadowInput } = buildShadowInput();
    const seen: Event[] = [];
    const sub = createChangeObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((e) => seen.push(e));
    // Web-component pattern: re-dispatch change as composed to escape the
    // boundary. No focusin/click ever revealed the root — the document
    // listener must own it (retargeted), not silently drop it.
    changeOn(shadowInput, true);
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });

  test('a composed CLICK also discovers roots (WebKit checkbox/radio fire change without focusin)', () => {
    const { shadowInput } = buildShadowInput();
    const seen: Event[] = [];
    const sub = createChangeObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((e) => seen.push(e));
    shadowInput.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    changeOn(shadowInput); // non-composed — only a per-root listener can hear it
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });

  test('after a mid-session disable, attached per-root listeners go silent (no duplicates either)', () => {
    const { shadowInput, lightInput } = buildShadowInput();
    const gate = { enabled: true, maxDepth: 1 };
    const seen: Event[] = [];
    const sub = createChangeObservable(() => gate).subscribe((e) => seen.push(e));
    focusInto(shadowInput);
    changeOn(shadowInput);
    expect(seen).toHaveLength(1);

    gate.enabled = false; // e.g. remote config flips shadowDomEnabled off
    changeOn(shadowInput); // non-composed shadow change: dropped (off path)
    expect(seen).toHaveLength(1);
    changeOn(shadowInput, true); // composed: document listener owns it, exactly once
    expect(seen).toHaveLength(2);
    changeOn(lightInput); // light DOM unaffected
    expect(seen).toHaveLength(3);
    sub.unsubscribe();
  });

  test('discovery prunes roots whose host left the DOM (and they can be re-discovered)', () => {
    const { shadowInput, lightInput, host } = buildShadowInput();
    const seen: Event[] = [];
    const sub = createChangeObservable(() => ({ enabled: true, maxDepth: 1 })).subscribe((e) => seen.push(e));
    focusInto(shadowInput);
    changeOn(shadowInput);
    expect(seen).toHaveLength(1);

    host.remove(); // component unmounts
    focusInto(lightInput); // any discovery pass prunes the disconnected root
    document.body.appendChild(host); // remounted
    changeOn(shadowInput); // listener was pruned — not captured yet
    expect(seen).toHaveLength(1);
    focusInto(shadowInput); // re-discovered on the next interaction
    changeOn(shadowInput);
    expect(seen).toHaveLength(2);
    sub.unsubscribe();
  });

  test('a getter that starts throwing AFTER discovery silences per-root listeners safely', () => {
    const { shadowInput } = buildShadowInput();
    let boom = false;
    const gate = () => {
      if (boom) throw new Error('later boom');
      return { enabled: true, maxDepth: 1 };
    };
    const seen: Event[] = [];
    const sub = createChangeObservable(gate).subscribe((e) => seen.push(e));
    focusInto(shadowInput); // discovers the root while the gate is healthy
    boom = true;
    expect(() => changeOn(shadowInput)).not.toThrow();
    expect(seen).toHaveLength(0);
    sub.unsubscribe();
  });

  test('a throwing shadow-config getter neither breaks discovery nor document changes', () => {
    const { lightInput, shadowInput } = buildShadowInput();
    const seen: Event[] = [];
    const sub = createChangeObservable(() => {
      throw new Error('gate boom');
    }).subscribe((e) => seen.push(e));
    expect(() => focusInto(shadowInput)).not.toThrow();
    changeOn(lightInput);
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });
});

describe('matchEventToFilter — shadow crossings', () => {
  const hierarchyFilter = (selector: string): Filter => ({
    subprop_key: '[Amplitude] Element Hierarchy',
    subprop_op: 'autotrack css match',
    subprop_value: [selector],
  });

  const buildEvent = () => {
    document.body.innerHTML = `<section class="checkout"><div id="host"></div></section>`;
    const host = document.getElementById('host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<button id="pay">Pay</button>`;
    const button = root.getElementById('pay') as Element;
    return {
      event: { type: 'click', closestTrackedAncestor: button, targetElementProperties: {} } as unknown as Parameters<
        typeof matchEventToFilter
      >[0],
    };
  };

  test('does not match a light-DOM ancestor selector with 0 crossings (prior behavior)', () => {
    const { event } = buildEvent();
    expect(matchEventToFilter(event, hierarchyFilter('section.checkout'))).toBe(false);
  });

  test('matches a light-DOM ancestor selector when a crossing is allowed', () => {
    const { event } = buildEvent();
    expect(matchEventToFilter(event, hierarchyFilter('section.checkout'), 1)).toBe(true);
  });
});

describe('TriggerEvaluator — shadow crossings gate', () => {
  // A labeled event whose hierarchy filter targets a LIGHT-DOM ancestor of the
  // shadow host, wired to a trigger whose action attaches an observable event
  // property. The trigger can only fire if the evaluator threads a nonzero
  // crossing depth into labeled-event matching — so the attached property is a
  // direct behavioral probe of the gate at TriggerEvaluator.evaluate.
  const buildEvaluatorFixture = () => {
    document.body.innerHTML = `<section class="checkout"><h2 id="zone-label">Checkout zone</h2><div id="host"></div></section>`;
    const host = document.getElementById('host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<button id="pay">Pay</button>`;
    const button = root.getElementById('pay') as Element;

    const labeledEvent = {
      id: 'le-1',
      definition: [
        {
          event_type: '[Amplitude] Element Clicked' as const,
          filters: [
            {
              subprop_key: '[Amplitude] Element Hierarchy' as const,
              subprop_op: 'autotrack css match',
              subprop_value: ['section.checkout'],
            },
          ],
        },
      ],
    };
    const trigger = {
      id: 't-1',
      name: 'attach checkout prop',
      conditions: [{ type: 'LABELED_EVENT' as const, match: { eventId: 'le-1' } }],
      actions: [
        {
          id: 'a-1',
          actionType: 'ATTACH_EVENT_PROPERTY' as const,
          dataSource: {
            sourceType: 'DOM_ELEMENT' as const,
            selector: '#zone-label',
            elementExtractType: 'TEXT' as const,
          },
          destinationKey: 'checkout_zone',
        },
      ],
    };

    const evaluator = createTriggerEvaluator(
      groupLabeledEventIdsByEventType([labeledEvent]),
      createLabeledEventToTriggerMap([trigger]),
      new DataExtractor({}),
      { pageActions: { labeledEvents: { 'le-1': labeledEvent }, triggers: [trigger] } },
    );

    const event = {
      type: 'click',
      closestTrackedAncestor: button,
      targetElementProperties: {} as Record<string, unknown>,
      event: {},
      timestamp: 1,
    } as unknown as Parameters<TriggerEvaluator['evaluate']>[0];

    return { evaluator, event };
  };

  test('fires triggers for shadow-internal elements when piercing is on (depth threaded through)', () => {
    setShadowConfig({ shadowDomEnabled: true, maxShadowDomDepth: 1 });
    const { evaluator, event } = buildEvaluatorFixture();
    evaluator.evaluate(event);
    expect(event.targetElementProperties['checkout_zone']).toBe('Checkout zone');
  });

  test('does not fire the same trigger when piercing is off (crossings gate returns 0)', () => {
    setShadowConfig({ shadowDomEnabled: false });
    const { evaluator, event } = buildEvaluatorFixture();
    evaluator.evaluate(event);
    expect(event.targetElementProperties['checkout_zone']).toBeUndefined();
  });
});

describe('updateSelectorConfig — two-switch guard', () => {
  test('applies a shadow-only delivery and preserves the engine `enabled` state', () => {
    new DataExtractor({}).updateSelectorConfig({ shadowDomEnabled: true, maxShadowDomDepth: 3 });
    expect(engineConfig()).toEqual({ shadowDomEnabled: true, maxShadowDomDepth: 3 });
  });

  test('an enabled-only delivery preserves the current shadow switch and depth', () => {
    new DataExtractor({}).updateSelectorConfig({ shadowDomEnabled: true, maxShadowDomDepth: 4 });
    new DataExtractor({}).updateSelectorConfig({ enabled: true });
    expect(engineConfig()).toEqual({ shadowDomEnabled: true, maxShadowDomDepth: 4 });
  });

  test('ignores a delivery with neither switch', () => {
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    new DataExtractor({}).updateSelectorConfig({ shadowDomEnabled: true, maxShadowDomDepth: 2 });
    new DataExtractor({}).updateSelectorConfig({ maxShadowDomDepth: 9 }, logger);
    expect(engineConfig()).toEqual({ shadowDomEnabled: true, maxShadowDomDepth: 2 });
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('ignoring remote-config delivery'));
  });

  test('a shadow delivery without a depth keeps the current depth', () => {
    new DataExtractor({}).updateSelectorConfig({ shadowDomEnabled: true, maxShadowDomDepth: 5 });
    new DataExtractor({}).updateSelectorConfig({ shadowDomEnabled: true });
    expect(engineConfig()).toEqual({ shadowDomEnabled: true, maxShadowDomDepth: 1 });
  });
});

describe('autocapturePlugin({ shadowDomSupport }) — local opt-in', () => {
  test('boolean form enables piercing with the default depth', () => {
    autocapturePlugin({ shadowDomSupport: true });
    expect(engineConfig()).toEqual({ shadowDomEnabled: true, maxShadowDomDepth: 1 });
  });

  test('object form sets the crossing depth', () => {
    autocapturePlugin({ shadowDomSupport: { maxDepth: 3 } });
    expect(engineConfig()).toEqual({ shadowDomEnabled: true, maxShadowDomDepth: 3 });
  });

  test('object form without maxDepth keeps the default depth', () => {
    autocapturePlugin({ shadowDomSupport: {} });
    expect(engineConfig()).toEqual({ shadowDomEnabled: true, maxShadowDomDepth: 1 });
  });

  test('omitting the option leaves piercing off', () => {
    autocapturePlugin({});
    expect(engineConfig()).toEqual({ shadowDomEnabled: false, maxShadowDomDepth: 1 });
  });
});

describe('getText — mask directive on a shadow host', () => {
  const buildMaskedShadowButton = () => {
    document.body.innerHTML = `<div id="host" data-amp-mask></div>`;
    const host = document.getElementById('host') as Element;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<button id="pii">Jane Doe</button>`;
    return root.getElementById('pii') as Element;
  };

  test('DISABLED: host-level mask does not reach shadow internals (prior behavior)', () => {
    const button = buildMaskedShadowButton();
    expect(new DataExtractor({}).getText(button)).toBe('Jane Doe');
  });

  test('ENABLED: host-level mask masks text extracted from shadow internals', () => {
    setShadowConfig({ shadowDomEnabled: true, maxShadowDomDepth: 1 });
    const button = buildMaskedShadowButton();
    expect(new DataExtractor({}).getText(button)).toBe('*****');
  });
});
