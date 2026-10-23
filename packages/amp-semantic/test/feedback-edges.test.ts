/* eslint-disable no-restricted-globals -- Browser recorder fixtures. */
import { feedbackRecorder } from '../src/recorders/feedback';
import { recorderContext } from './page-feedback-helpers';
import { replaySource } from './replay-feedback-helpers';

let frames: FrameRequestCallback[];
let cleanup: () => void;
function step() {
  const next = frames.shift();
  expect(next).toBeDefined();
  next!(0);
}
function drain() {
  for (let n = 0; frames.length && n < 100; n++) step();
  expect(frames).toHaveLength(0);
}
function setup() {
  const fixture = recorderContext();
  const replay = replaySource(fixture);
  cleanup = feedbackRecorder.setup(fixture.context);
  return { ...fixture, replay };
}
function body(html: string) {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}
beforeEach(() => {
  jest.useFakeTimers();
  frames = [];
  document.body.innerHTML = '';
  cleanup = () => undefined;
  jest.spyOn(window.performance, 'now').mockReturnValue(0);
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => {
    frames.push(fn);
    return frames.length;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
    frames = [];
  });
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('drops duplicate discovery in a mutation and detached replay additions', () => {
  const { replay, emit } = setup();
  const notice = body('<div role="status">Ready</div>');
  replay.mutation({
    texts: [{ id: replay.id(notice) }],
    adds: [{ parentId: replay.id(document.body), node: replay.serialize(notice) }],
  });
  drain();
  expect(emit).toHaveBeenCalledTimes(1);
  replay.add(notice);
  notice.remove();
  drain();
  expect(emit).toHaveBeenCalledTimes(1);
});

test('skips empty notices and notices that lose capacity during delivery', () => {
  const { replay, context, emit } = setup();
  const root = body('<section><div role="status"> </div><div role="status">Ready</div></section>');
  context.canEmit = () => false;
  // Capacity may change between intake and payload emission (another recorder can emit).
  context.hasCapacity = () => true;
  replay.add(root);
  drain();
  expect(emit).not.toHaveBeenCalled();
  context.canEmit = () => true;
  replay.add(root);
  drain();
  expect(emit).toHaveBeenCalledTimes(1);
});

test('drops blocked dialogs before delivery and releases their registry slots', () => {
  const { replay, emit } = setup();
  const root = body('<section>' + '<dialog open></dialog>'.repeat(51) + '</section>');
  replay.add(root);
  step();
  const last = root.lastElementChild!;
  last.className = 'amp-block';
  drain();
  expect(emit).toHaveBeenCalledTimes(50);
});

test('removes detached ready notices, trailing timers and closed dialogs on structural changes', () => {
  const { replay, emit } = setup();
  const root = body('<section><dialog></dialog>' + '<div role="status">Ready</div>'.repeat(51) + '</section>');
  replay.snapshot();
  drain();
  replay.add(root);
  step();
  const last = root.lastElementChild!;
  replay.remove(last);
  drain();
  expect(emit).toHaveBeenCalledTimes(50);
  const firstNotice = root.querySelector('[role="status"]')!;
  replay.text(firstNotice);
  drain();
  expect(jest.getTimerCount()).toBe(1);
  replay.remove(firstNotice);
  replay.remove(root.firstElementChild!);
  drain();
  expect(jest.getTimerCount()).toBe(0);
});

test('clears pending trailing timers at teardown and tolerates a queued frame after teardown', () => {
  const { replay, emit } = setup();
  const notice = body('<div role="status">Ready</div>');
  replay.add(notice);
  drain();
  replay.text(notice);
  drain();
  expect(jest.getTimerCount()).toBe(1);
  replay.text(notice);
  const pending = frames[0];
  cleanup();
  pending(0);
  expect(jest.getTimerCount()).toBe(0);
  expect(emit).toHaveBeenCalledTimes(1);
});

test('deactivates before a queued frame or DOM notification when both capacities are exhausted', () => {
  const { replay, context, emit } = setup();
  replay.add(body('<dialog open></dialog>'));
  context.hasCapacity = () => false;
  step();
  expect(emit).not.toHaveBeenCalled();
  cleanup();
  const second = setup();
  second.context.hasCapacity = () => false;
  second.replay.mutation({});
  expect(frames).toHaveLength(0);
});

test('supports the timer frame fallback and cancels it on teardown', () => {
  Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, writable: true, value: undefined });
  const { replay, emit } = setup();
  replay.add(body('<div role="status">Ready</div>'));
  jest.advanceTimersByTime(16);
  expect(emit).toHaveBeenCalledTimes(1);
  replay.mutation({});
  cleanup();
  expect(jest.getTimerCount()).toBe(0);
});

test('handles partial serialized nodes and records alertdialog snapshot identity across later changes', () => {
  const { replay, emit } = setup();
  const dialog = body('<div role="alertdialog" aria-modal="true">Confirm</div>');
  replay.send({
    type: 'snapshot',
    node: { id: replay.id(dialog), type: 2, tagName: 'div', attributes: { role: 'alertdialog', hidden: '' } },
  });
  drain();
  replay.attrs(dialog, 'hidden');
  drain();
  expect(emit).toHaveBeenCalledWith('dialog', expect.objectContaining({ role: 'alertdialog', state: 'open' }));
  replay.send({ type: 'snapshot', node: { id: replay.id(document.body), type: 2, tagName: 'body' } });
  drain();
  expect(emit).toHaveBeenCalledTimes(1);
});

test('bounds overflow diagnostics even without a host logger', () => {
  const { replay, emit } = setup();
  replay.add(body('<section>' + '<div role="status">Ready</div>'.repeat(260) + '</section>'));
  drain();
  expect(emit).toHaveBeenCalledTimes(256);
});

test('drops notices detached by an earlier emission in the same frame', () => {
  const { replay, emit } = setup();
  const root = body('<section><div role="status">First</div><div role="status">Removed</div></section>');
  emit.mockImplementationOnce(() => {
    root.lastElementChild!.remove();
    return true;
  });
  replay.add(root);
  drain();
  expect(emit).toHaveBeenCalledTimes(1);
});

test('ignores a trailing timer already queued when teardown runs', () => {
  const timers = jest.spyOn(window, 'setTimeout');
  const { replay, emit } = setup();
  const notice = body('<div role="status">Ready</div>');
  replay.add(notice);
  drain();
  replay.text(notice);
  drain();
  const trailing = timers.mock.calls.find(([, delay]) => delay === 500)![0] as () => void;
  cleanup();
  trailing();
  expect(emit).toHaveBeenCalledTimes(1);
  expect(frames).toHaveLength(0);
});

test('releases removed closed dialogs from both registries before admitting replacements', () => {
  const { replay, context, emit } = setup();
  const root = body('<section>' + '<dialog></dialog>'.repeat(256) + '</section>');
  const removed = new Set(Array.from(root.children));
  replay.snapshot();
  drain();
  const blocked = jest.spyOn(context.helpers, 'blocked');
  replay.remove(root);
  const replacement = body('<section>' + '<dialog open></dialog>'.repeat(260) + '</section>');
  replay.add(replacement);
  drain();
  expect(emit).toHaveBeenCalledTimes(256);
  expect(blocked.mock.calls.some(([element]) => removed.has(element))).toBe(false);
});
