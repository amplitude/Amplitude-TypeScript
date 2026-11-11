import { createSemanticCapture, resourceErrorRecorder, SEMANTIC_CAPS } from '../src';
import { createHelpers } from '../src/helpers';
import type {
  RecorderContext,
  SemanticCapture,
  SemanticCaptureConfig,
  SemanticEvent,
  SemanticHost,
  SemanticRecorder,
} from '../src';

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

describe('resource errors', () => {
  test('handles empty and malformed URLs, changed paths, and invalid targets', () => {
    start(resourceErrorRecorder);
    document.body.innerHTML =
      '<img><script src=""></script><link rel="stylesheet"><img src="http://["><img class="amp-block" src="/secret">';
    for (const element of Array.from(document.body.children)) fail(element);
    document.dispatchEvent(new Event('error'));
    const image = document.body.firstElementChild as HTMLImageElement;
    fail(image);
    image.setAttribute('src', '/next.png');
    fail(image);
    jest.advanceTimersByTime(500);
    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({ rt: 'img', count: 3 }),
      expect.objectContaining({ rt: 'script', count: 1 }),
      expect.objectContaining({ rt: 'css', count: 1 }),
      expect.objectContaining({ rt: 'img', path: '/next.png', count: 1 }),
    ]);
  });

  test('rechecks enablement and ignores late resource and font callbacks', () => {
    const fonts = new EventTarget();
    const original = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    try {
      const onDocument = jest.spyOn(document, 'addEventListener');
      const onWindow = jest.spyOn(window, 'addEventListener');
      const onFonts = jest.spyOn(fonts, 'addEventListener');
      let enabled = true;
      const emit = jest.fn();
      const host: SemanticHost = {
        document,
        window,
        sdk: 'test',
        getPrivacy: () => ({ defaultMaskLevel: 'light' }),
        emit: jest.fn(),
      };
      const context = {
        host,
        helpers: createHelpers(host),
        onCleanup: jest.fn(),
        now: Date.now,
        enabled: () => enabled,
        canEmit: () => true,
        emit,
        on: jest.fn(),
        dropped: () => ({}),
        clearDropped: jest.fn(),
      } as unknown as RecorderContext;
      const cleanup = resourceErrorRecorder.setup(context);
      const onError = onDocument.mock.calls.find(([type]) => type === 'error')![1] as EventListener;
      const onPagehide = onWindow.mock.calls.find(([type]) => type === 'pagehide')![1] as EventListener;
      const onFontError = onFonts.mock.calls.find(([type]) => type === 'loadingerror')![1] as EventListener;
      onError(new Event('error'));
      onFontError(new Event('loadingerror'));
      onFontError(Object.assign(new Event('loadingerror'), { fontfaces: [] }));
      const first = img('/first.png');
      fail(first);
      enabled = false;
      fail(img('/disabled.png'));
      onFontError(Object.assign(new Event('loadingerror'), { fontfaces: [{}] }));
      jest.advanceTimersByTime(500);
      expect(emit).not.toHaveBeenCalled();
      cleanup();
      onError(new Event('error'));
      onPagehide(new Event('pagehide'));
      onFontError(Object.assign(new Event('loadingerror'), { fontfaces: [{}] }));
      expect(emit).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(document, 'fonts', original);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });
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
  test('omits non-http paths but preserves long sanitized paths', () => {
    start(resourceErrorRecorder);
    fail(img('data:image/png;base64,PRIVATE'));
    fail(img('blob:https://example.com/PRIVATE'));
    const path = '/assets/' + 'folder/'.repeat(40) + 'image.png';
    fail(img(path + '?private=hidden#secret'));
    jest.advanceTimersByTime(500);
    expect(events).toHaveLength(2);
    expect(events[0].payload).toMatchObject({ rt: 'img', count: 2 });
    expect(events[0].payload).not.toHaveProperty('path');
    expect(events[1].payload).toMatchObject({ rt: 'img', count: 1, path });
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
