import { createCapture, SEMANTIC_CAPS } from '../src/capture';
import { feedbackRecorder } from '../src/recorders/feedback';
import { recorderContext } from './page-feedback-helpers';
import { replaySource } from './replay-feedback-helpers';

describe('replay feedback budgets', () => {
  let clock: number;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  const step = () => {
    const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
    expect(next).toBeDefined();
    if (next) {
      frames.delete(next[0]);
      next[1](clock);
    }
  };
  const drain = () => {
    for (let i = 0; frames.size && i < 100; i++) step();
    expect(frames.size).toBe(0);
  };
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    clock = 0;
    nextFrame = 0;
    frames = new Map();
    jest.spyOn(window.performance, 'now').mockImplementation(() => clock);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('inspects large serialized additions incrementally without resolving ordinary DOM nodes', () => {
    const fixture = recorderContext();
    const replay = replaySource(fixture);
    const cleanup = feedbackRecorder.setup(fixture.context);
    document.body.innerHTML = '<section>' + '<span></span>'.repeat(5000) + '<div role="status">Ready</div></section>';
    const resolve = jest.spyOn(fixture.context.host, 'getNode');
    const blocked = jest.spyOn(fixture.context.helpers, 'blocked');
    replay.add(document.body.firstChild!);
    expect(resolve).not.toHaveBeenCalled();
    step();
    expect(fixture.emit).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    drain();
    expect(fixture.emit).toHaveBeenCalledWith('notice', expect.objectContaining({ text: 'Ready' }));
    // One parent lookup and one relevant element, rather than checking 5,000 spans.
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(blocked.mock.calls.length).toBeLessThanOrEqual(3);
    cleanup();
  });

  test('deduplicates parents for flat rrweb additions and budgets irrelevant attributes', () => {
    const fixture = recorderContext();
    const replay = replaySource(fixture);
    const cleanup = feedbackRecorder.setup(fixture.context);
    document.body.innerHTML = '<span></span>'.repeat(5000);
    const resolve = jest.spyOn(fixture.context.host, 'getNode');
    const parentId = replay.id(document.body);
    replay.mutation({
      adds: Array.from(document.body.children, (element) => ({ parentId, node: replay.serialize(element) })),
      attributes: Array.from({ length: 5000 }, () => ({ id: parentId, attributes: { class: 'unrelated' } })),
    });
    step();
    expect(resolve).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    drain();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(fixture.emit).not.toHaveBeenCalled();
    cleanup();
  });

  test('alternates families when a payload exceeds the cooperative time budget', () => {
    const fixture = recorderContext();
    const replay = replaySource(fixture);
    const cleanup = feedbackRecorder.setup(fixture.context);
    fixture.context.helpers.visible = () => {
      clock += 5;
      return true;
    };
    document.body.innerHTML =
      '<section>' + '<div role="status">Notice</div>'.repeat(80) + '<dialog open></dialog></section>';
    replay.add(document.body.firstChild!);
    step();
    expect(fixture.emit.mock.calls.map(([family]) => family)).toEqual(['notice']);
    step();
    expect(fixture.emit.mock.calls.map(([family]) => family)).toEqual(['notice', 'dialog']);
    cleanup();
  });

  test('trailing timers enqueue work without bypassing the 50-payload frame limit', () => {
    const fixture = recorderContext();
    const replay = replaySource(fixture);
    const cleanup = feedbackRecorder.setup(fixture.context);
    document.body.innerHTML = '<section>' + '<div role="status">First</div>'.repeat(60) + '</section>';
    replay.add(document.body.firstChild!);
    drain();
    expect(fixture.emit).toHaveBeenCalledTimes(60);
    document.querySelectorAll('[role="status"]').forEach((element) => {
      element.firstChild!.textContent = 'Latest';
      replay.text(element.firstChild!);
    });
    drain();
    expect(jest.getTimerCount()).toBe(60);
    jest.advanceTimersByTime(500);
    expect(fixture.emit).toHaveBeenCalledTimes(60);
    step();
    expect(fixture.emit).toHaveBeenCalledTimes(110);
    step();
    expect(fixture.emit).toHaveBeenCalledTimes(120);
    cleanup();
  });

  test('bounds notice queues and replay batch retention with isolated diagnostics', () => {
    const fixture = recorderContext(['dialog']);
    const replay = replaySource(fixture);
    const diagnostic = jest.fn();
    fixture.context.host.onError = diagnostic;
    const cleanup = feedbackRecorder.setup(fixture.context);
    document.body.innerHTML = '<section>' + '<div role="status">Notice</div>'.repeat(400) + '</section>';
    replay.add(document.body.firstChild!);
    drain();
    expect(fixture.emit).toHaveBeenCalledTimes(256);
    expect(diagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('notice queue') }),
    );
    diagnostic.mockImplementation(() => {
      throw new Error('diagnostic failure');
    });
    for (let i = 0; i < 300; i++) replay.mutation({});
    expect(diagnostic).toHaveBeenCalledTimes(2);
    cleanup();
    expect(frames.size).toBe(0);
  });

  test('bounds dialog registry and checks removal without traversing detached subtrees', () => {
    document.body.innerHTML =
      '<section>' + '<dialog open></dialog>'.repeat(300) + '<span></span>'.repeat(5000) + '</section>';
    const fixture = recorderContext();
    const replay = replaySource(fixture);
    fixture.context.host.onError = jest.fn();
    const cleanup = feedbackRecorder.setup(fixture.context);
    replay.snapshot();
    drain();
    expect(fixture.context.host.onError).toHaveBeenCalledTimes(1);
    expect(fixture.emit).not.toHaveBeenCalled();
    const walk = jest.spyOn(document, 'createTreeWalker');
    replay.remove(document.body.firstChild!);
    drain();
    expect(walk).not.toHaveBeenCalled();
    expect(fixture.emit).toHaveBeenCalledTimes(256);
    expect(fixture.emit.mock.calls.every(([, payload]) => 'state' in payload && payload.state === 'closed')).toBe(true);
    cleanup();
  });

  test('keeps dialogs active after notices cap and unsubscribes when both exhaust', () => {
    const fixture = recorderContext();
    const replay = replaySource(fixture);
    const counts = { notice: 0, dialog: 0 };
    fixture.context.hasCapacity = (family) => counts[family as keyof typeof counts] < 2;
    fixture.emit.mockImplementation((family) => {
      counts[family as keyof typeof counts]++;
      return true;
    });
    const cleanup = feedbackRecorder.setup(fixture.context);
    document.body.innerHTML =
      '<section><div role="status">One</div><div role="status">Two</div><dialog open></dialog></section>';
    replay.add(document.body.firstChild!);
    drain();
    expect(counts).toEqual({ notice: 2, dialog: 1 });
    const dialog = document.querySelector('dialog')!;
    dialog.removeAttribute('open');
    replay.attrs(dialog, 'open');
    drain();
    expect(counts).toEqual({ notice: 2, dialog: 2 });
    replay.mutation({});
    expect(frames.size).toBe(0);
    cleanup();
  });

  test('preserves real session caps on resume and resumes feedback after reset', () => {
    const fixture = recorderContext(['notice']);
    const replay = replaySource(fixture);
    const output = jest.fn();
    const capture = createCapture(
      { enabled: true, families: { notice: false } },
      { ...fixture.context.host, emit: output, random: () => 0 },
      [feedbackRecorder],
    );
    fixture.signal = capture.notify;
    capture.start();
    document.body.innerHTML = '<dialog></dialog>';
    const dialog = document.querySelector('dialog')!;
    replay.snapshot();
    drain();
    for (let i = 0; i < SEMANTIC_CAPS.dialog; i++) {
      dialog.toggleAttribute('open', i % 2 === 0);
      replay.attrs(dialog, 'open');
      drain();
    }
    expect(output).toHaveBeenCalledTimes(SEMANTIC_CAPS.dialog);
    capture.stop();
    capture.start();
    replay.snapshot();
    expect(frames.size).toBe(0);
    capture.resetSession();
    replay.snapshot();
    drain();
    dialog.setAttribute('open', '');
    replay.attrs(dialog, 'open');
    drain();
    expect(output).toHaveBeenCalledTimes(SEMANTIC_CAPS.dialog + 1);
    capture.stop();
  });
});
