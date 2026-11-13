import { createSemanticCapture, keysRecorder, SEMANTIC_CAPS } from '../src';
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
function key(target: Element, value: string, options: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, composed: true, ...options }));
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
  test('supports an existing helper instance, dynamic disabling, and Alt navigation keys', () => {
    document.body.innerHTML = '<button>Go</button>';
    const button = document.querySelector('button')!;
    const emitted = jest.fn();
    let enabled = false;
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
      emit: emitted,
      on: jest.fn(),
      dropped: () => ({}),
      clearDropped: jest.fn(),
    } as unknown as RecorderContext;
    const cleanup = keysRecorder.setup(context);
    key(button, 'Escape');
    expect(emitted).not.toHaveBeenCalled();
    enabled = true;
    key(button, 'ArrowLeft', { altKey: true });
    expect(emitted).toHaveBeenCalledWith('keys', expect.objectContaining({ key: 'Alt+ArrowLeft' }));
    cleanup();
  });
  test('captures Escape and canonical shortcuts on the actual rrweb target', () => {
    document.body.innerHTML = '<button data-node="213">Close</button>';
    start(keysRecorder);
    const button = document.querySelector('button')!;
    key(button, 'Escape');
    key(button, 'k', { metaKey: true });
    key(button, 'P', { ctrlKey: true, shiftKey: true });
    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({
        key: 'Escape',
        target: { id: 213, role: 'button', name: 'Close', name_source: 'text', states: [] },
      }),
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
  test('reads key target states and name provenance at each observation', () => {
    document.body.innerHTML =
      '<input aria-label="Search" aria-expanded="false" readonly><input placeholder="Hint"><input><input type="button" value="PRIVATE"><button class="amp-mask">PRIVATE</button>';
    start(keysRecorder);
    const input = document.querySelector('input')!;
    key(input, 'ArrowDown');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-invalid', 'spelling');
    key(input, 'ArrowDown');
    expect(events[0].payload).toMatchObject({
      target: { name: 'Search', name_source: 'aria-label', states: ['collapsed', 'readonly'] },
    });
    expect(events[1].payload).toMatchObject({
      target: { name_source: 'aria-label', states: ['invalid', 'expanded', 'readonly'] },
    });
    document.querySelectorAll('input,button').forEach((element) => key(element, 'Tab'));
    const targets = events.flatMap((event) => (event.name === 'keys' ? [event.payload.target] : [])).slice(3);
    expect(targets.map((target) => target.name_source)).toEqual(['placeholder', 'unnamed', 'masked', 'masked']);
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
