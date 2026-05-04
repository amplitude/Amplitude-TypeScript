import * as AnalyticsCore from '@amplitude/analytics-core';
import { CrossOriginIframeCoordinator, isInIframe, listenForParentSignals } from '../src/cross-origin-iframes';
import { CROSS_ORIGIN_IFRAME_MESSAGE_TYPE } from '../src/constants';

describe('isInIframe', () => {
  const originalParent = window.parent;

  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: originalParent, writable: true, configurable: true });
  });

  it('returns false when window.parent === window (top-level page)', () => {
    Object.defineProperty(window, 'parent', { value: window, writable: true, configurable: true });
    expect(isInIframe()).toBe(false);
  });

  it('returns true when window.parent !== window (inside iframe)', () => {
    Object.defineProperty(window, 'parent', { value: {} as Window, writable: true, configurable: true });
    expect(isInIframe()).toBe(true);
  });

  it('returns true when accessing window.parent throws (sandboxed environment)', () => {
    Object.defineProperty(window, 'parent', {
      get() {
        throw new Error('SecurityError');
      },
      configurable: true,
    });
    expect(isInIframe()).toBe(true);
  });

  it('returns false when getGlobalScope() returns null (non-browser environment)', () => {
    const spy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(null as any);
    expect(isInIframe()).toBe(false);
    spy.mockRestore();
  });
});

describe('CrossOriginIframeCoordinator', () => {
  let coordinator: CrossOriginIframeCoordinator;
  let iframe1: HTMLIFrameElement;
  let iframe2: HTMLIFrameElement;

  beforeEach(() => {
    coordinator = new CrossOriginIframeCoordinator();

    iframe1 = document.createElement('iframe');
    iframe2 = document.createElement('iframe');
    document.body.appendChild(iframe1);
    document.body.appendChild(iframe2);

    // Mock contentWindow.postMessage on each iframe
    const mockPostMessage1 = jest.fn();
    const mockPostMessage2 = jest.fn();
    Object.defineProperty(iframe1, 'contentWindow', { value: { postMessage: mockPostMessage1 }, configurable: true });
    Object.defineProperty(iframe2, 'contentWindow', { value: { postMessage: mockPostMessage2 }, configurable: true });
  });

  afterEach(() => {
    coordinator.stop();
    iframe1.remove();
    iframe2.remove();
  });

  it('sends start signal to all existing iframes on start()', () => {
    coordinator.start();
    const pm1 = (iframe1.contentWindow as any).postMessage as jest.Mock;
    const pm2 = (iframe2.contentWindow as any).postMessage as jest.Mock;
    expect(pm1).toHaveBeenCalledWith({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' }, '*');
    expect(pm2).toHaveBeenCalledWith({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' }, '*');
  });

  it('sends start signal to dynamically added iframes after they load', async () => {
    coordinator.start();

    const dynamicIframe = document.createElement('iframe');
    const mockPostMessage = jest.fn();
    Object.defineProperty(dynamicIframe, 'contentWindow', {
      value: { postMessage: mockPostMessage },
      configurable: true,
    });
    document.body.appendChild(dynamicIframe);

    // MutationObserver callbacks fire asynchronously
    await new Promise((r) => setTimeout(r, 0));

    // No message before the iframe's load event — it would go to about:blank otherwise
    expect(mockPostMessage).not.toHaveBeenCalled();

    // Simulate the child page finishing its load
    dynamicIframe.dispatchEvent(new Event('load'));

    expect(mockPostMessage).toHaveBeenCalledWith({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' }, '*');
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    dynamicIframe.remove();
  });

  it('sends stop signal to all iframes and disconnects observer on stop()', () => {
    coordinator.start();
    coordinator.stop();

    const pm1 = (iframe1.contentWindow as any).postMessage as jest.Mock;
    const pm2 = (iframe2.contentWindow as any).postMessage as jest.Mock;
    expect(pm1).toHaveBeenCalledWith({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'stop' }, '*');
    expect(pm2).toHaveBeenCalledWith({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'stop' }, '*');
  });

  it('cancels pending load listener when stopped before iframe finishes loading', async () => {
    coordinator.start();

    const dynamicIframe = document.createElement('iframe');
    const mockPostMessage = jest.fn();
    Object.defineProperty(dynamicIframe, 'contentWindow', {
      value: { postMessage: mockPostMessage },
      configurable: true,
    });
    document.body.appendChild(dynamicIframe);

    await new Promise((r) => setTimeout(r, 0));

    // Stop before the iframe loads — the pending listener should be removed
    coordinator.stop();

    // Simulate the child page finishing its load (listener should already be gone)
    dynamicIframe.dispatchEvent(new Event('load'));

    // stop() sends a stop signal (via sendToAllIframes) but must NOT send a start signal
    expect(mockPostMessage).toHaveBeenCalledWith({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'stop' }, '*');
    expect(mockPostMessage).not.toHaveBeenCalledWith({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' }, '*');
    dynamicIframe.remove();
  });

  it('does not accumulate MutationObservers when start() is called twice', async () => {
    coordinator.start();

    const dynamicIframe1 = document.createElement('iframe');
    const mockPm1 = jest.fn();
    Object.defineProperty(dynamicIframe1, 'contentWindow', { value: { postMessage: mockPm1 }, configurable: true });

    // Second start() should disconnect the first observer before creating a new one
    coordinator.start();

    document.body.appendChild(dynamicIframe1);
    await new Promise((r) => setTimeout(r, 0));
    dynamicIframe1.dispatchEvent(new Event('load'));

    // Only one start signal, not two (from two observers)
    expect(mockPm1).toHaveBeenCalledTimes(1);
    dynamicIframe1.remove();
  });

  it('sends start signal to iframes nested inside a dynamically added container element', async () => {
    coordinator.start();

    // Simulate a framework inserting a wrapper div that already contains an iframe
    const wrapper = document.createElement('div');
    const nestedIframe = document.createElement('iframe');
    const mockPostMessage = jest.fn();
    Object.defineProperty(nestedIframe, 'contentWindow', {
      value: { postMessage: mockPostMessage },
      configurable: true,
    });
    wrapper.appendChild(nestedIframe);
    document.body.appendChild(wrapper);

    await new Promise((r) => setTimeout(r, 0));

    // No message yet — waiting for load
    expect(mockPostMessage).not.toHaveBeenCalled();

    nestedIframe.dispatchEvent(new Event('load'));
    expect(mockPostMessage).toHaveBeenCalledWith({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' }, '*');
    wrapper.remove();
  });

  it('ignores non-element added nodes such as text nodes', async () => {
    coordinator.start();
    const pm1 = (iframe1.contentWindow as any).postMessage as jest.Mock;
    pm1.mockClear(); // clear the start call from coordinator.start()

    const textNode = document.createTextNode('hello');
    document.body.appendChild(textNode);
    await new Promise((r) => setTimeout(r, 0));

    expect(pm1).not.toHaveBeenCalled();
    textNode.remove();
  });

  it('handles iframes with no contentWindow gracefully', () => {
    Object.defineProperty(iframe1, 'contentWindow', { value: null, configurable: true });
    expect(() => coordinator.start()).not.toThrow();
  });

  it('returns early from start() when getGlobalScope() returns null', () => {
    const spy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(null as any);
    expect(() => coordinator.start()).not.toThrow();
    const pm1 = (iframe1.contentWindow as any).postMessage as jest.Mock;
    expect(pm1).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('listenForParentSignals', () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  function dispatchMessage(source: Window, data: unknown) {
    const event = new MessageEvent('message', { data, source });
    window.dispatchEvent(event);
  }

  it('calls onStart when a start message arrives from window.parent', () => {
    const onStart = jest.fn();
    const onStop = jest.fn();
    cleanup = listenForParentSignals({ onStart, onStop });

    dispatchMessage(window.parent, { type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' });

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });

  it('calls onStop when a stop message arrives from window.parent', () => {
    const onStart = jest.fn();
    const onStop = jest.fn();
    cleanup = listenForParentSignals({ onStart, onStop });

    dispatchMessage(window.parent, { type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'stop' });

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('ignores messages from sources other than window.parent', () => {
    const onStart = jest.fn();
    const onStop = jest.fn();
    cleanup = listenForParentSignals({ onStart, onStop });

    // Use a source that is explicitly not window.parent (a child iframe, for instance)
    const foreignSource = {} as Window;
    dispatchMessage(foreignSource, { type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' });

    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it('ignores messages with wrong type', () => {
    const onStart = jest.fn();
    const onStop = jest.fn();
    cleanup = listenForParentSignals({ onStart, onStop });

    dispatchMessage(window.parent, { type: 'some-other-type', action: 'start' });

    expect(onStart).not.toHaveBeenCalled();
  });

  it('ignores messages with null data', () => {
    const onStart = jest.fn();
    cleanup = listenForParentSignals({ onStart, onStop: jest.fn() });

    dispatchMessage(window.parent, null);

    expect(onStart).not.toHaveBeenCalled();
  });

  it('removes the event listener after cleanup', () => {
    const onStart = jest.fn();
    cleanup = listenForParentSignals({ onStart, onStop: jest.fn() });
    cleanup();

    dispatchMessage(window.parent, { type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' });

    expect(onStart).not.toHaveBeenCalled();
  });

  it('returns a no-op cleanup when getGlobalScope() returns null', () => {
    const spy = jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(null as any);
    const onStart = jest.fn();
    cleanup = listenForParentSignals({ onStart, onStop: jest.fn() });
    expect(() => cleanup()).not.toThrow();
    expect(onStart).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
