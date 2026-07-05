/**
 * The shadow-DOM gate: how it resolves a mode, when it transitions, and what the
 * observables do when it arms after they have already subscribed.
 *
 * That ordering is the normal one: the plugin builds its observables during
 * setup, and remote config arrives afterwards. The observables must end up
 * observing the same shadow roots either way.
 */
import { type IDiagnosticsClient } from '@amplitude/analytics-core';
import { createMutationObservable, createExposureObservable } from '../src/observables';
import { DataExtractor } from '../src/data-extractor';
import { TimestampedEvent } from '../src/helpers';
import { Observable } from '@amplitude/analytics-core';
import {
  createShadowGate,
  shadowModeFromConfig,
  SHADOW_OFF,
  resetSharedShadowGateForTesting,
  type ShadowOn,
} from '../src/shadow-mode';

function attachOpen(host: Element, html: string): ShadowRoot {
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = html;
  return root;
}

/** Let jsdom's MutationObserver microtask flush. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const ON = (maxDepth: number): ShadowOn => ({ enabled: true, maxDepth });

afterEach(() => {
  resetSharedShadowGateForTesting();
  new DataExtractor({}).updateSelectorConfig(undefined);
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('shadowModeFromConfig', () => {
  it('maps a disabled config to the single canonical off value', () => {
    expect(shadowModeFromConfig({ shadowDomEnabled: false, maxShadowDomDepth: 5 })).toBe(SHADOW_OFF);
  });

  it('treats a non-positive budget as off, so "on but inert" is unrepresentable', () => {
    expect(shadowModeFromConfig({ shadowDomEnabled: true, maxShadowDomDepth: 0 })).toBe(SHADOW_OFF);
  });

  it('carries the budget through when enabled', () => {
    expect(shadowModeFromConfig({ shadowDomEnabled: true, maxShadowDomDepth: 3 })).toEqual({
      enabled: true,
      maxDepth: 3,
    });
  });
});

describe('ShadowGate — arm-once latch', () => {
  it('starts off', () => {
    expect(createShadowGate().get()).toBe(SHADOW_OFF);
  });

  it('a delivery that resolves to off never arms it', () => {
    const gate = createShadowGate();
    gate.arm(SHADOW_OFF);
    expect(gate.get().enabled).toBe(false);
  });

  it('arms on the first enabled delivery', () => {
    const gate = createShadowGate();
    expect(gate.arm(ON(2))).toEqual({ enabled: true, maxDepth: 2 });
    expect(gate.get()).toEqual({ enabled: true, maxDepth: 2 });
  });

  it('ignores every delivery after arming, including turning it back off', () => {
    const gate = createShadowGate();
    gate.arm(ON(2));

    // A remote kill switch does not disarm mid-page — it takes effect on the
    // next page load. This is the property that makes the on state deterministic.
    gate.arm(SHADOW_OFF);
    expect(gate.get()).toEqual({ enabled: true, maxDepth: 2 });

    // Nor does a later delivery change the budget out from under live observers.
    gate.arm(ON(9));
    expect(gate.get()).toEqual({ enabled: true, maxDepth: 2 });
  });

  it('notifies subscribers exactly once, on the arming delivery', () => {
    const gate = createShadowGate();
    const seen: ShadowOn[] = [];
    gate.onArm((mode) => seen.push(mode));

    expect(seen).toHaveLength(0);
    gate.arm(ON(1));
    gate.arm(ON(1));
    expect(seen).toEqual([{ enabled: true, maxDepth: 1 }]);
  });

  it('runs a subscriber immediately when the gate is already armed', () => {
    const gate = createShadowGate();
    gate.arm(ON(4));
    const seen: ShadowOn[] = [];
    gate.onArm((mode) => seen.push(mode));
    expect(seen).toEqual([{ enabled: true, maxDepth: 4 }]);
  });

  it('does not notify a subscriber that unsubscribed before arming', () => {
    const gate = createShadowGate();
    const cb = jest.fn();
    const unsubscribe = gate.onArm(cb);
    unsubscribe();
    gate.arm(ON(1));
    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribing after arming is a harmless no-op', () => {
    const gate = createShadowGate();
    gate.arm(ON(1));
    const unsubscribe = gate.onArm(jest.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  it('a throwing subscriber neither blocks the others nor escapes to the caller', () => {
    const gate = createShadowGate();
    const after = jest.fn();
    gate.onArm(() => {
      throw new Error('scan boom');
    });
    gate.onArm(after);

    expect(() => gate.arm(ON(1))).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber added after arming does not escape', () => {
    const gate = createShadowGate();
    gate.arm(ON(1));
    expect(() =>
      gate.onArm(() => {
        throw new Error('late scan boom');
      }),
    ).not.toThrow();
  });
});

describe('late remote config — mutation observer picks up pre-existing shadow roots', () => {
  it('observes a shadow root that mounted BEFORE the gate armed', async () => {
    // Host and shadow root exist at page load; remote config lands afterwards.
    document.body.innerHTML = `<my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<div id="sr"></div>`);

    const gate = createShadowGate(); // remote config has not landed yet
    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(gate).subscribe((m) => batches.push(m));

    const sawShadow = () => batches.some((b) => b.some((rec) => rec.target.getRootNode() === root));

    // While off, mutations inside the shadow root are invisible.
    root.getElementById('sr')?.appendChild(document.createElement('span'));
    await tick();
    expect(sawShadow()).toBe(false);

    // Remote config arrives and arms the gate → the pre-existing root is scanned.
    gate.arm(ON(1));

    root.getElementById('sr')?.appendChild(document.createElement('span'));
    await tick();
    expect(sawShadow()).toBe(true);

    sub.unsubscribe();
  });

  it('stops running the arm scan once unsubscribed', async () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<div id="sr"></div>`);

    const gate = createShadowGate();
    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(gate).subscribe((m) => batches.push(m));
    sub.unsubscribe();

    gate.arm(ON(1));
    root.getElementById('sr')?.appendChild(document.createElement('span'));
    await tick();

    expect(batches.some((b) => b.some((rec) => rec.target.getRootNode() === root))).toBe(false);
  });

  it('tracks the crossing depth of a root discovered by the arm scan', async () => {
    // Exercises depthOfTree for a nested root attached during the arm scan: a
    // mutation in the depth-2 tree must still resolve its recorded depth.
    document.body.innerHTML = `<my-card></my-card>`;
    const cardRoot = attachOpen(document.querySelector('my-card') as Element, `<my-button></my-button>`);
    const innerRoot = attachOpen(cardRoot.querySelector('my-button') as Element, `<div id="deep"></div>`);

    const gate = createShadowGate();
    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(gate).subscribe((m) => batches.push(m));
    gate.arm(ON(2));

    // A nested host added inside the depth-2 tree resolves its base depth from
    // the recorded rootDepth rather than falling back to 0.
    const deep = innerRoot.getElementById('deep') as Element;
    const nestedHost = document.createElement('my-leaf');
    deep.appendChild(nestedHost);
    await tick();

    expect(batches.some((b) => b.some((rec) => rec.target.getRootNode() === innerRoot))).toBe(true);
    sub.unsubscribe();
  });
});

describe('late remote config — exposure discovery picks up pre-existing shadow elements', () => {
  let mutationObservable: Observable<TimestampedEvent<MutationRecord[]>>;
  let mockIntersectionObserver: { observe: jest.Mock; disconnect: jest.Mock };

  beforeEach(() => {
    mutationObservable = { subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })) } as unknown as Observable<
      TimestampedEvent<MutationRecord[]>
    >;
    mockIntersectionObserver = { observe: jest.fn(), disconnect: jest.fn() };
    (global as any).IntersectionObserver = jest.fn(() => mockIntersectionObserver);
  });

  it('registers an in-shadow element that existed before the gate armed', () => {
    document.body.innerHTML = `<button class="track-me">light</button><my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<button class="track-me">shadow</button>`);
    const shadowButton = root.querySelector('button') as Element;

    const gate = createShadowGate();
    const obs = createExposureObservable(mutationObservable, ['.track-me'], gate);
    obs.subscribe(() => undefined);

    const observed = () => mockIntersectionObserver.observe.mock.calls.map((c) => c[0] as Element);
    expect(observed()).not.toContain(shadowButton);

    gate.arm(ON(1));
    expect(observed()).toContain(shadowButton);
  });
});

describe('DataExtractor — latch wiring', () => {
  it('arms on the first enabling delivery and ignores a later kill switch', () => {
    const extractor = new DataExtractor({});
    expect(extractor.getShadowMode().enabled).toBe(false);

    extractor.updateSelectorConfig({ shadowDomEnabled: true, maxShadowDomDepth: 2 });
    expect(extractor.getShadowMode()).toEqual({ enabled: true, maxDepth: 2 });

    // Turning it off remotely does not disarm the current page.
    extractor.updateSelectorConfig({ shadowDomEnabled: false });
    expect(extractor.getShadowMode()).toEqual({ enabled: true, maxDepth: 2 });
  });

  it('keeps the selector engine in lockstep with the latch', () => {
    const extractor = new DataExtractor({});
    extractor.updateSelectorConfig({ shadowDomEnabled: true, maxShadowDomDepth: 2 });

    // A later payload that omits/disables shadow must not desync selector
    // generation from the capture layer.
    extractor.updateSelectorConfig({ enabled: true, shadowDomEnabled: false });

    document.body.innerHTML = `<my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<button id="cta">x</button>`);
    const inner = root.getElementById('cta') as Element;

    // Still piercing, matching the latched capture-side mode.
    expect(extractor.getElementPath(inner)).toContain('>>>');
  });

  it('shares one latch across separate DataExtractor instances', () => {
    // autocapture-plugin and frustration-plugin build separate extractors and
    // subscribe independently; they must never disagree about the gate.
    const autocapture = new DataExtractor({});
    const frustration = new DataExtractor({});

    autocapture.updateSelectorConfig({ shadowDomEnabled: true, maxShadowDomDepth: 1 });
    expect(frustration.getShadowMode()).toEqual({ enabled: true, maxDepth: 1 });
    expect(frustration.shadowGate).toBe(autocapture.shadowGate);
  });

  it('tags diagnostics once, when the gate arms', () => {
    const setTag = jest.fn();
    const diagnosticsClient = { setTag } as unknown as IDiagnosticsClient;
    const extractor = new DataExtractor({}, { diagnosticsClient });

    // An off delivery emits nothing.
    extractor.updateSelectorConfig(undefined);
    expect(setTag).not.toHaveBeenCalled();

    extractor.updateSelectorConfig({ shadowDomEnabled: true, maxShadowDomDepth: 3 });
    expect(setTag).toHaveBeenCalledTimes(1);
    expect(setTag).toHaveBeenCalledWith('plugin.autocapture.shadowDom', 'enabled:3');

    // Already armed — no duplicate tag on subsequent deliveries.
    extractor.updateSelectorConfig({ shadowDomEnabled: true, maxShadowDomDepth: 3 });
    expect(setTag).toHaveBeenCalledTimes(1);
  });
});
