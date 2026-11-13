import { Unsubscribable, Observable } from '@amplitude/analytics-core';
import { createMouseMoveObservable, createMutationObservable, createExposureObservable } from '../src/observables';
import { createShadowGate, SHADOW_OFF, type ShadowGate } from '../src/shadow-mode';
import { TimestampedEvent } from '../src/helpers';
import { trackExposure } from '../src/autocapture/track-exposure';
import { AllWindowObservables } from '../src/autocapture-plugin';
import { DataExtractor } from '../src/data-extractor';

function attachOpen(host: Element, html: string): ShadowRoot {
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = html;
  return root;
}

const armedGate = (maxDepth: number): ShadowGate => {
  const gate = createShadowGate();
  gate.arm({ enabled: true, maxDepth });
  return gate;
};

const offGate = (): ShadowGate => createShadowGate();

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createMouseMoveObservable', () => {
  it('should create a mouse move observable and capture mouse move events', async () => {
    const observable = createMouseMoveObservable();
    let subscription: Unsubscribable | undefined;
    const subscriptionPromise = new Promise<MouseEvent>((resolve) => {
      subscription = observable.subscribe((event) => {
        resolve(event);
      });
    });
    const mouseMoveEvent = new MouseEvent('mousemove', {
      clientX: 100,
      clientY: 100,
    });
    document.dispatchEvent(mouseMoveEvent);
    const event = await subscriptionPromise;
    expect(event.clientX).toBe(100);
    expect(event.clientY).toBe(100);
    subscription?.unsubscribe();
  });
});

describe('createMutationObservable — shadow fan-out', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not observe shadow-root mutations when shadow is disabled', async () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<div id="sr"></div>`);

    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(offGate()).subscribe((m) => batches.push(m));

    root.getElementById('sr')?.appendChild(document.createElement('span'));
    await tick();

    const sawShadowMutation = batches.some((b) => b.some((rec) => rec.target.getRootNode() === root));
    expect(sawShadowMutation).toBe(false);
    sub.unsubscribe();
  });

  it('observes mutations inside an open shadow root when shadow is enabled', async () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const root = attachOpen(document.querySelector('my-host') as Element, `<div id="sr"></div>`);

    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(armedGate(1)).subscribe((m) => batches.push(m));

    root.getElementById('sr')?.appendChild(document.createElement('span'));
    await tick();

    const sawShadowMutation = batches.some((b) => b.some((rec) => rec.target.getRootNode() === root));
    expect(sawShadowMutation).toBe(true);
    sub.unsubscribe();
  });

  it('attaches to a shadow root that mounts after setup', async () => {
    document.body.innerHTML = '';
    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(armedGate(1)).subscribe((m) => batches.push(m));

    const host = document.createElement('my-host');
    document.body.appendChild(host);
    const root = attachOpen(host, `<div id="late"></div>`);
    await tick();

    root.getElementById('late')?.appendChild(document.createElement('span'));
    await tick();

    const sawShadowMutation = batches.some((b) => b.some((rec) => rec.target.getRootNode() === root));
    expect(sawShadowMutation).toBe(true);
    sub.unsubscribe();
  });

  it('respects the shadow depth budget for nested roots', async () => {
    document.body.innerHTML = `<my-card></my-card>`;
    const cardRoot = attachOpen(document.querySelector('my-card') as Element, `<my-button></my-button>`);
    const innerRoot = attachOpen(cardRoot.querySelector('my-button') as Element, `<div id="deep"></div>`);

    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(armedGate(1)).subscribe((m) => batches.push(m));

    innerRoot.getElementById('deep')?.appendChild(document.createElement('span'));
    await tick();

    const sawDeepMutation = batches.some((b) => b.some((rec) => rec.target.getRootNode() === innerRoot));
    expect(sawDeepMutation).toBe(false);
    sub.unsubscribe();
  });

  it('behaves like a plain body observer when no shadow gate is supplied', async () => {
    document.body.innerHTML = `<div id="light"></div>`;
    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable().subscribe((m) => batches.push(m));

    document.getElementById('light')?.appendChild(document.createElement('span'));
    await tick();

    expect(batches.length).toBeGreaterThan(0);
    sub.unsubscribe();
  });

  it('still emits light-DOM mutations when the shadow gate throws', async () => {
    document.body.innerHTML = `<div id="light"></div>`;
    const batches: MutationRecord[][] = [];
    const hostileGate: ShadowGate = {
      get: () => {
        throw new Error('boom');
      },
      arm: () => SHADOW_OFF,
      onArm: () => () => undefined,
    };
    const sub = createMutationObservable(hostileGate).subscribe((m) => batches.push(m));

    document.getElementById('light')?.appendChild(document.createElement('span'));
    await tick();

    expect(batches.length).toBeGreaterThan(0);
    sub.unsubscribe();
  });

  it('does not double-observe a shadow root that is re-scanned', async () => {
    document.body.innerHTML = `<my-host></my-host>`;
    const host = document.querySelector('my-host') as Element;
    const root = attachOpen(host, `<div id="sr"></div>`);

    const batches: MutationRecord[][] = [];
    const sub = createMutationObservable(armedGate(1)).subscribe((m) => batches.push(m));

    document.body.appendChild(host);
    await tick();

    root.getElementById('sr')?.appendChild(document.createElement('span'));
    await tick();

    const spanInsertions = batches
      .flat()
      .filter((rec) => rec.target.getRootNode() === root)
      .filter((rec) => Array.from(rec.addedNodes).some((n) => n.nodeName === 'SPAN'));
    expect(spanInsertions).toHaveLength(1);
    sub.unsubscribe();
  });
});

describe('createExposureObservable — shadow mutation path', () => {
  let mockIntersectionObserver: { observe: jest.Mock; unobserve: jest.Mock; disconnect: jest.Mock };
  let intersectionCallback: (entries: IntersectionObserverEntry[]) => void;

  beforeEach(() => {
    mockIntersectionObserver = { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };
    (global as any).IntersectionObserver = jest.fn((callback) => {
      intersectionCallback = callback;
      return mockIntersectionObserver;
    });
    document.body.innerHTML = '';
  });

  it.each([false, true])('unobserves removed subtrees, including shadow DOM: %s', async (shadow) => {
    const wrapper = document.createElement('div');
    const button = document.createElement('button');
    button.className = 'track-me';
    (shadow ? wrapper.attachShadow({ mode: 'open' }) : wrapper).appendChild(button);
    document.body.appendChild(wrapper);
    const gate = shadow ? armedGate(1) : offGate();
    const mutations = createMutationObservable(gate).map((event) => ({ event } as TimestampedEvent<MutationRecord[]>));
    const onExposure = jest.fn();
    const subscription = createExposureObservable(mutations, ['.track-me'], gate).subscribe(onExposure);
    await Promise.resolve();
    expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(button);

    // Cleanup must not depend on whether the detached node still matches.
    button.className = '';
    wrapper.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockIntersectionObserver.unobserve).toHaveBeenCalledWith(button);
    expect(onExposure).toHaveBeenCalledWith(expect.objectContaining({ target: button, isIntersecting: false }));
    subscription.unsubscribe();
  });

  it('preserves observation when a node moves within the document', async () => {
    const button = document.createElement('button');
    button.className = 'track-me';
    const wrapper = document.createElement('div');
    document.body.append(button, wrapper);
    const mutations = createMutationObservable().map((event) => ({ event } as TimestampedEvent<MutationRecord[]>));
    const onExposure = jest.fn();
    const subscription = createExposureObservable(mutations, ['.track-me']).subscribe(onExposure);
    await Promise.resolve();
    mockIntersectionObserver.unobserve.mockClear();

    wrapper.appendChild(button);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockIntersectionObserver.unobserve).not.toHaveBeenCalled();
    expect(onExposure).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('unobserves nested shadow targets discovered with a fresh subtree depth budget', async () => {
    const outerHost = document.createElement('div');
    const outerRoot = outerHost.attachShadow({ mode: 'open' });
    document.body.appendChild(outerHost);
    const gate = armedGate(1);
    const mutations = createMutationObservable(gate).map((event) => ({ event } as TimestampedEvent<MutationRecord[]>));
    const listener = jest.fn();
    const subscription = createExposureObservable(mutations, ['.track-me'], gate).subscribe(listener);
    await Promise.resolve();

    // This insertion is visible to the outer root's MutationObserver. Discovery
    // starts a fresh one-boundary walk at innerHost, reaching a target two shadow
    // boundaries below outerHost despite the gate's maxDepth of one.
    const innerHost = document.createElement('div');
    const innerRoot = innerHost.attachShadow({ mode: 'open' });
    const button = document.createElement('button');
    button.className = 'track-me';
    innerRoot.appendChild(button);
    outerRoot.appendChild(innerHost);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(button);
    intersectionCallback([{ target: button, isIntersecting: true } as unknown as IntersectionObserverEntry]);
    listener.mockClear();

    outerHost.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockIntersectionObserver.unobserve).toHaveBeenCalledWith(button);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ target: button, isIntersecting: false }));
    subscription.unsubscribe();
  });

  it('cleans up a removed nested shadow target when its hosts remain connected', async () => {
    jest.useFakeTimers();
    const outerHost = document.createElement('div');
    const outerRoot = outerHost.attachShadow({ mode: 'open' });
    document.body.appendChild(outerHost);
    const gate = armedGate(1);
    const mutations = createMutationObservable(gate).map((event) => ({ event } as TimestampedEvent<MutationRecord[]>));
    const exposureObservable = createExposureObservable(mutations, ['button'], gate);
    let scroll: (() => void) | undefined;
    const scrollObservable = new Observable<Event>((observer) => {
      scroll = () => observer.next(new Event('scroll'));
      return () => undefined;
    });
    const onExposure = jest.fn();
    const tracking = trackExposure({
      allObservables: { exposureObservable, scrollObservable } as AllWindowObservables,
      onExposure,
      dataExtractor: new DataExtractor({}),
      exposureDuration: 1000,
    });

    try {
      const innerHost = document.createElement('div');
      const innerRoot = innerHost.attachShadow({ mode: 'open' });
      const button = document.createElement('button');
      const measure = jest.spyOn(button, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
      } as DOMRect);
      innerRoot.appendChild(button);
      outerRoot.appendChild(innerHost);
      await Promise.resolve();
      await Promise.resolve();
      expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(button);

      intersectionCallback([{ target: button, isIntersecting: true } as unknown as IntersectionObserverEntry]);
      expect(jest.getTimerCount()).toBe(1);
      button.remove();
      await Promise.resolve();
      await Promise.resolve();
      expect(outerHost.isConnected).toBe(true);
      expect(innerHost.isConnected).toBe(true);
      // The inner root exceeds the mutation observer's depth budget.
      expect(mockIntersectionObserver.unobserve).not.toHaveBeenCalledWith(button);

      intersectionCallback([{ target: button, isIntersecting: false } as unknown as IntersectionObserverEntry]);
      expect(mockIntersectionObserver.unobserve).toHaveBeenCalledWith(button);
      expect(jest.getTimerCount()).toBe(0);
      measure.mockClear();
      scroll?.();
      expect(measure).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      expect(onExposure).not.toHaveBeenCalled();
    } finally {
      tracking.unsubscribe();
      jest.useRealTimers();
    }
  });

  it('unobserves nodes added and removed in the same light-DOM mutation batch', async () => {
    const mutations = createMutationObservable().map((event) => ({ event } as TimestampedEvent<MutationRecord[]>));
    const onExposure = jest.fn();
    const subscription = createExposureObservable(mutations, ['button']).subscribe(onExposure);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockIntersectionObserver.unobserve).toHaveBeenCalledWith(button);
    expect(onExposure).toHaveBeenCalledWith(expect.objectContaining({ target: button, isIntersecting: false }));
    subscription.unsubscribe();
  });

  it('ignores stale intersection entries for removed elements', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const mutations = createMutationObservable().map((event) => ({ event } as TimestampedEvent<MutationRecord[]>));
    const listener = jest.fn();
    const subscription = createExposureObservable(mutations, ['button']).subscribe(listener);
    button.remove();
    await Promise.resolve();
    await Promise.resolve();
    listener.mockClear();
    intersectionCallback([{ target: button, isIntersecting: true } as unknown as IntersectionObserverEntry]);
    expect(listener).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('uses light-DOM querySelectorAll for added nodes when shadow is disabled', () => {
    let deliver: ((v: { event: Array<{ addedNodes: Node[] }> }) => void) | undefined;
    const mo = {
      subscribe: jest.fn((cb: (v: { event: Array<{ addedNodes: Node[] }> }) => void) => {
        deliver = cb;
        return { unsubscribe: jest.fn() };
      }),
    } as unknown as Observable<TimestampedEvent<MutationRecord[]>>;

    const obs = createExposureObservable(mo, ['.track-me'], offGate());
    obs.subscribe(() => undefined);
    mockIntersectionObserver.observe.mockClear();

    const wrapper = document.createElement('div');
    const child = document.createElement('button');
    child.className = 'track-me';
    wrapper.appendChild(child);
    deliver?.({ event: [{ addedNodes: [wrapper] }] });

    expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(child);
  });

  it('ignores non-Element added nodes', () => {
    let deliver: ((v: { event: Array<{ addedNodes: Node[] }> }) => void) | undefined;
    const mo = {
      subscribe: jest.fn((cb: (v: { event: Array<{ addedNodes: Node[] }> }) => void) => {
        deliver = cb;
        return { unsubscribe: jest.fn() };
      }),
    } as unknown as Observable<TimestampedEvent<MutationRecord[]>>;

    const obs = createExposureObservable(mo, ['div'], offGate());
    obs.subscribe(() => undefined);
    const callsBefore = mockIntersectionObserver.observe.mock.calls.length;

    deliver?.({ event: [{ addedNodes: [document.createTextNode('text')] }] });

    expect(mockIntersectionObserver.observe.mock.calls.length).toBe(callsBefore);
  });

  it('does not throw when the allowlist selector is malformed and shadow is enabled', () => {
    let deliver: ((v: { event: Array<{ addedNodes: Node[] }> }) => void) | undefined;
    const mo = {
      subscribe: jest.fn((cb: (v: { event: Array<{ addedNodes: Node[] }> }) => void) => {
        deliver = cb;
        return { unsubscribe: jest.fn() };
      }),
    } as unknown as Observable<TimestampedEvent<MutationRecord[]>>;

    const obs = createExposureObservable(mo, [':::'], armedGate(1));
    expect(() => obs.subscribe(() => undefined)).not.toThrow();

    const node = document.createElement('div');
    expect(() => deliver?.({ event: [{ addedNodes: [node] }] })).not.toThrow();
  });

  it('observes a self-matching added node when shadow is enabled', () => {
    let deliver: ((v: { event: Array<{ addedNodes: Node[] }> }) => void) | undefined;
    const mo = {
      subscribe: jest.fn((cb: (v: { event: Array<{ addedNodes: Node[] }> }) => void) => {
        deliver = cb;
        return { unsubscribe: jest.fn() };
      }),
    } as unknown as Observable<TimestampedEvent<MutationRecord[]>>;

    const obs = createExposureObservable(mo, ['.track-me'], armedGate(1));
    obs.subscribe(() => undefined);
    mockIntersectionObserver.observe.mockClear();

    const button = document.createElement('button');
    button.className = 'track-me';
    deliver?.({ event: [{ addedNodes: [button] }] });

    expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(button);
  });
});
