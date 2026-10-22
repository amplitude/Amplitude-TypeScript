import { createSemanticCapture, keysRecorder, resourceErrorRecorder, SEMANTIC_CAPS } from '../src';
import type { SemanticCapture, SemanticCaptureConfig, SemanticEvent, SemanticHost, SemanticRecorder } from '../src';

let capture: SemanticCapture;
let events: SemanticEvent[];
let privacy: ReturnType<SemanticHost['getPrivacy']>;
function start(recorder: SemanticRecorder, config: SemanticCaptureConfig = { enabled: true }) {
  events = [];
  privacy = { defaultMaskLevel: 'light' };
  capture = createSemanticCapture(
    config,
    {
      document,
      window,
      sdk: 'test',
      emit: (event) => events.push(event),
      getPrivacy: () => privacy,
      getUrl: () => 'https://example.com/page',
      getNodeId: (node) => Number((node as Element).getAttribute('data-node')) || 7,
    },
    [recorder],
  );
  capture.start();
}
function key(target: Element, value: string, options: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, composed: true, ...options }));
}
function fail(element: Element) {
  element.dispatchEvent(new Event('error'));
}
function img(src = '/products/8812/image.png?secret=PRIVATE#route') {
  const element = document.createElement('img');
  element.src = src;
  document.body.append(element);
  return element;
}

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '';
  jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  capture?.stop();
  jest.restoreAllMocks();
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('keys', () => {
  test('captures Escape and canonical shortcuts on the actual rrweb target', () => {
    document.body.innerHTML = '<button data-node="213">Close</button>';
    start(keysRecorder);
    const button = document.querySelector('button')!;
    key(button, 'Escape');
    key(button, 'k', { metaKey: true });
    key(button, 'P', { ctrlKey: true, shiftKey: true });
    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({ key: 'Escape', target: { id: 213, role: 'button', name: 'Close' } }),
      expect.objectContaining({ key: 'Meta+K' }),
      expect.objectContaining({ key: 'Ctrl+Shift+P' }),
    ]);
    expect(events.every((event) => event.name === 'keys' && event.payload.v === 1 && event.payload.tab_id)).toBe(true);
  });
  test('never captures typing, unknown shortcuts, modifiers, repeats, IME, or AltGraph', () => {
    start(keysRecorder);
    for (const value of ['a', 'S', '1', ' ', 'Backspace', 'Delete', 'Shift', 'Dead', 'Unidentified'])
      key(document.body, value);
    key(document.body, 's', { ctrlKey: true });
    key(document.body, 'k', { altKey: true });
    key(document.body, 'k', { ctrlKey: true, altKey: true });
    key(document.body, 'Escape', { repeat: true });
    key(document.body, 'Enter', { isComposing: true });
    key(document.body, 'Enter', { keyCode: 229 });
    const altGraph = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
    jest.spyOn(altGraph, 'getModifierState').mockReturnValue(true);
    document.body.dispatchEvent(altGraph);
    expect(events).toEqual([]);
  });
  test('respects masking, blocked hosts, password controls, and never uses editable contents', () => {
    document.body.innerHTML =
      '<button class="amp-mask">PRIVATE</button><input type="password"><input type="hidden"><textarea>PRIVATE</textarea><div contenteditable="true">PRIVATE</div><div class="amp-block" id="host"></div>';
    start(keysRecorder);
    for (const target of Array.from(document.querySelectorAll('button,input,textarea,[contenteditable]')))
      key(target, 'Escape');
    const shadow = document.querySelector('#host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button>PRIVATE</button>';
    key(shadow.querySelector('button')!, 'Escape');
    expect(events).toHaveLength(3);
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });
  test('independent disable, sample-out, teardown, and cap apply', () => {
    start(keysRecorder, { enabled: true, families: { keys: false } });
    key(document.body, 'Escape');
    expect(events).toEqual([]);
    capture.updateConfig({ enabled: true });
    for (let i = 0; i < SEMANTIC_CAPS.keys + 2; i++) key(document.body, 'Escape');
    expect(events).toHaveLength(SEMANTIC_CAPS.keys);
    capture.stop();
    key(document.body, 'Escape');
    expect(events).toHaveLength(SEMANTIC_CAPS.keys);
    start(keysRecorder, { enabled: true, sampleRate: 0 });
    key(document.body, 'Escape');
    expect(events).toEqual([]);
  });
});

describe('resource errors', () => {
  test('aggregates matching failures and templates paths without origins, queries, or fragments', () => {
    start(resourceErrorRecorder);
    fail(img());
    fail(img());
    jest.advanceTimersByTime(499);
    expect(events).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ rt: 'img', count: 2, path: '/products/:id/image.png' });
    expect(events[0].payload).not.toHaveProperty('container');
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
    fail(img());
    jest.advanceTimersByTime(500);
    expect(events[1].payload).toMatchObject({ count: 1 });
  });
  test('separates containers and rechecks masking, blocking, and detachment before emission', () => {
    document.body.innerHTML = '<section role="region" aria-label="PRIVATE" id="region"><img src="/a.png"></section>';
    start(resourceErrorRecorder);
    const region = document.querySelector('#region')!;
    fail(region.querySelector('img')!);
    region.className = 'amp-mask';
    const blocked = img('/blocked.png');
    fail(blocked);
    blocked.className = 'amp-block';
    const removed = img('/removed.png');
    fail(removed);
    removed.remove();
    jest.advanceTimersByTime(500);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ container: { role: 'region', name: null } });
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });
  test('captures stylesheet and script load failures but ignores runtime errors and preloads', () => {
    start(resourceErrorRecorder);
    document.body.innerHTML =
      '<link rel="stylesheet" href="/theme.css?secret=PRIVATE"><script src="/app.js#PRIVATE"></script><link rel="preload" href="/preload.woff2"><script></script><div></div>';
    for (const element of Array.from(document.body.children)) fail(element);
    window.dispatchEvent(new ErrorEvent('error', { message: 'PRIVATE' }));
    jest.advanceTimersByTime(500);
    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({ rt: 'css', count: 1, path: '/theme.css' }),
      expect.objectContaining({ rt: 'script', count: 1, path: '/app.js' }),
    ]);
  });
  test('omits paths for non-http and overlength URLs', () => {
    start(resourceErrorRecorder);
    fail(img('data:image/png;base64,PRIVATE'));
    fail(img('blob:https://example.com/PRIVATE'));
    fail(img('/' + 'x'.repeat(201)));
    jest.advanceTimersByTime(500);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ rt: 'img', count: 3 });
    expect(events[0].payload).not.toHaveProperty('path');
  });
  test('reports failed font count without guessing URL/container and removes its listener', () => {
    const fonts = new EventTarget();
    const original = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    try {
      start(resourceErrorRecorder);
      const event = new Event('loadingerror');
      Object.defineProperty(event, 'fontfaces', { value: [{ family: 'PRIVATE' }, { family: 'PRIVATE' }] });
      fonts.dispatchEvent(event);
      jest.advanceTimersByTime(500);
      expect(events[0].payload).toEqual(expect.objectContaining({ rt: 'font', count: 2 }));
      expect(events[0].payload).not.toHaveProperty('path');
      expect(events[0].payload).not.toHaveProperty('container');
      expect(JSON.stringify(events)).not.toContain('PRIVATE');
      capture.stop();
      fonts.dispatchEvent(event);
      jest.advanceTimersByTime(500);
      expect(events).toHaveLength(1);
    } finally {
      if (original) Object.defineProperty(document, 'fonts', original);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });
  test('flushes on pagehide and hidden; discards pending work on disable/stop', () => {
    start(resourceErrorRecorder);
    fail(img());
    window.dispatchEvent(new Event('pagehide'));
    expect(events).toHaveLength(1);
    fail(img());
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(events).toHaveLength(2);
    fail(img());
    expect(events).toHaveLength(3);
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fail(img());
    capture.updateConfig({ enabled: true, families: { 'resource-error': false } });
    jest.advanceTimersByTime(500);
    fail(img());
    expect(events).toHaveLength(3);
    capture.updateConfig({ enabled: true });
    fail(img());
    capture.stop();
    jest.advanceTimersByTime(500);
    fail(img());
    expect(events).toHaveLength(3);
  });
  test('bounds pending groups, counts, and emitted events', () => {
    start(resourceErrorRecorder);
    for (let i = 0; i < 101; i++) fail(img(`/asset-${i}.png`));
    expect(events).toHaveLength(100);
    jest.advanceTimersByTime(500);
    expect(events).toHaveLength(101);
    for (let i = 0; i < 105; i++) {
      fail(img('/next.png'));
      window.dispatchEvent(new Event('pagehide'));
    }
    expect(events).toHaveLength(SEMANTIC_CAPS['resource-error']);
  });
});
