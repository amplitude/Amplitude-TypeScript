import { createCapture, SEMANTIC_CAPS } from '../src/capture';
import { feedbackRecorder } from '../src/recorders/feedback';
import { recorderContext } from './page-feedback-helpers';

/** Deterministic work costs exercise deadlines instead of benchmarking jsdom. */
describe('feedback under mutation pressure', () => {
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

  test('delivers ready events during continuous discovery that exhausts the time budget', async () => {
    document.body.innerHTML = '<div role="status">Ready</div><dialog></dialog>';
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    const blocked = context.helpers.blocked;
    context.helpers.blocked = (element) => {
      clock += 0.25;
      return blocked(element);
    };
    const dialog = document.querySelector('dialog')!;
    for (let i = 0; i < 12; i++) {
      const tree = document.createElement('section');
      tree.innerHTML = '<span></span>'.repeat(300);
      document.body.appendChild(tree);
      dialog.toggleAttribute('open', i % 2 === 0);
      document.querySelector('[role="status"]')!.textContent = `Update ${i}`;
      await Promise.resolve();
      const before = clock;
      step();
      expect(clock - before).toBeLessThanOrEqual(4.5);
      expect(emit).toHaveBeenCalledWith('dialog', expect.objectContaining({ state: i % 2 === 0 ? 'open' : 'closed' }));
      expect(emit.mock.calls.filter(([family]) => family === 'dialog')).toHaveLength(i + 1);
    }
    expect(emit).toHaveBeenCalledWith('notice', expect.objectContaining({ text: 'Update 0' }));
    cleanup();
    expect(frames.size).toBe(0);
  });

  test('alternates families even when one payload exceeds a whole frame budget', async () => {
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    context.helpers.visible = () => {
      clock += 5;
      return true;
    };
    document.body.innerHTML =
      '<section>' + '<div role="status">Notice</div>'.repeat(80) + '<dialog open></dialog></section>';
    await Promise.resolve();
    step();
    expect(emit.mock.calls.map(([family]) => family)).toEqual(['notice']);
    step();
    expect(emit.mock.calls.map(([family]) => family)).toEqual(['notice', 'dialog']);
    cleanup();
  });

  test('trailing notice timers enqueue work without bypassing the payload limit', async () => {
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    document.body.innerHTML = '<section>' + '<div role="status">First</div>'.repeat(60) + '</section>';
    await Promise.resolve();
    drain();
    expect(emit).toHaveBeenCalledTimes(60);
    document.querySelectorAll('[role="status"]').forEach((element) => {
      element.textContent = 'Latest';
    });
    await Promise.resolve();
    drain();
    expect(jest.getTimerCount()).toBe(60);
    jest.advanceTimersByTime(500);
    expect(emit).toHaveBeenCalledTimes(60);
    expect(frames.size).toBe(1);
    step();
    expect(emit).toHaveBeenCalledTimes(110);
    step();
    expect(emit).toHaveBeenCalledTimes(120);
    expect(jest.getTimerCount()).toBe(0);
    cleanup();
  });

  test('bounds discovery and notice queues and reports each overflow once', async () => {
    const { context, emit } = recorderContext(['dialog']);
    const diagnostic = jest.fn();
    context.host.onError = diagnostic;
    const cleanup = feedbackRecorder.setup(context);
    document.body.innerHTML = '<div role="status">First</div>'.repeat(400);
    await Promise.resolve();
    drain();
    expect(emit).toHaveBeenCalledTimes(256);
    expect(diagnostic.mock.calls.map(([error]) => (error as Error).message)).toEqual([
      expect.stringContaining('discovery queue'),
      expect.stringContaining('notice queue'),
    ]);
    document.body.innerHTML = '<div role="status">Second</div>'.repeat(400);
    await Promise.resolve();
    drain();
    expect(diagnostic).toHaveBeenCalledTimes(2);
    cleanup();
  });

  test('bounds mutation intake even when one record adds thousands of nodes', async () => {
    const { context } = recorderContext();
    context.host.onError = jest.fn(() => {
      throw new Error('diagnostics failed');
    });
    const cleanup = feedbackRecorder.setup(context);
    const blocked = jest.spyOn(context.helpers, 'blocked');
    document.body.innerHTML = '<span></span>'.repeat(5000);
    await Promise.resolve();
    expect(blocked.mock.calls.length).toBeLessThanOrEqual(1000);
    expect(context.host.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('mutation intake') }),
    );
    cleanup();
  });

  test('closes known dialogs without traversing a large detached subtree', async () => {
    document.body.innerHTML =
      '<section><dialog open aria-label="Existing"></dialog>' + '<span></span>'.repeat(5000) + '</section>';
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    const walk = jest.spyOn(document, 'createTreeWalker');
    document.querySelector('section')!.remove();
    await Promise.resolve();
    drain();
    expect(walk).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('dialog', expect.objectContaining({ state: 'closed', name: null }));
    cleanup();
  });

  test('discards detached discovery roots, pending notices and trailing timers', async () => {
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    const wrapper = document.createElement('section');
    wrapper.innerHTML = '<div role="status">First</div>';
    document.body.appendChild(wrapper);
    await Promise.resolve();
    drain();
    wrapper.firstElementChild!.textContent = 'Trailing';
    await Promise.resolve();
    drain();
    expect(jest.getTimerCount()).toBe(1);
    wrapper.innerHTML += '<section>' + '<span></span>'.repeat(2000) + '</section>';
    await Promise.resolve();
    const walk = jest.spyOn(document, 'createTreeWalker');
    wrapper.remove();
    await Promise.resolve();
    drain();
    jest.advanceTimersByTime(1000);
    expect(walk).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    cleanup();
  });

  test('recovers discovery when a framework removes the active walker cursor between frames', async () => {
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    const blocked = context.helpers.blocked;
    context.helpers.blocked = (element) => {
      clock += 0.5;
      return blocked(element);
    };
    const walk = jest.spyOn(document, 'createTreeWalker');
    document.body.innerHTML =
      '<section>' + '<span></span>'.repeat(30) + '<div role="status">Still discoverable</div></section>';
    await Promise.resolve();
    step();
    const walker = walk.mock.results[0].value as TreeWalker;
    (walker.currentNode as Element).remove();
    await Promise.resolve();
    drain();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('notice', expect.objectContaining({ text: 'Still discoverable' }));
    cleanup();
  });

  test('keeps dialog capture alive after notices cap, then disconnects when both are exhausted', async () => {
    const { context, emit } = recorderContext();
    const counts = { notice: 0, dialog: 0 };
    context.hasCapacity = (family) => counts[family as keyof typeof counts] < 2;
    emit.mockImplementation((family) => {
      counts[family as keyof typeof counts]++;
      return true;
    });
    const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
    const cleanup = feedbackRecorder.setup(context);
    document.body.innerHTML =
      '<section><div role="status">One</div><div role="status">Two</div><dialog open></dialog></section>';
    await Promise.resolve();
    drain();
    expect(counts).toEqual({ notice: 2, dialog: 1 });
    expect(disconnect).not.toHaveBeenCalled();
    document.querySelector('[role="status"]')!.textContent = 'Ignored';
    document.querySelector('dialog')!.removeAttribute('open');
    await Promise.resolve();
    drain();
    expect(counts).toEqual({ notice: 2, dialog: 2 });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    cleanup();
  });

  test('bounds baseline open-dialog tracking and retains their close transitions', async () => {
    document.body.innerHTML = '<section>' + '<dialog open></dialog>'.repeat(300) + '</section>';
    const { context, emit } = recorderContext();
    context.host.onError = jest.fn();
    const cleanup = feedbackRecorder.setup(context);
    expect(context.host.onError).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
    document.querySelector('section')!.remove();
    await Promise.resolve();
    drain();
    expect(emit).toHaveBeenCalledTimes(256);
    expect(emit.mock.calls.every(([, payload]) => 'state' in payload && payload.state === 'closed')).toBe(true);
    cleanup();
  });

  test('disconnects at real session caps, stays stopped on resume, and reattaches on reset', async () => {
    const { context } = recorderContext(['notice']);
    const output = jest.fn();
    const host = { ...context.host, emit: output, random: () => 0 };
    const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
    const observe = jest.spyOn(MutationObserver.prototype, 'observe');
    const capture = createCapture({ enabled: true, families: { notice: false } }, host, [feedbackRecorder]);
    capture.start();
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    await Promise.resolve();
    drain();
    for (let i = 0; i < SEMANTIC_CAPS.dialog; i++) {
      dialog.toggleAttribute('open', i % 2 === 0);
      await Promise.resolve();
      drain();
    }
    expect(output).toHaveBeenCalledTimes(SEMANTIC_CAPS.dialog);
    expect(disconnect).toHaveBeenCalledTimes(1);
    dialog.setAttribute('open', '');
    await Promise.resolve();
    expect(frames.size).toBe(0);
    capture.stop();
    capture.start();
    expect(observe).toHaveBeenCalledTimes(1);
    capture.resetSession();
    expect(observe).toHaveBeenCalledTimes(2);
    dialog.removeAttribute('open');
    await Promise.resolve();
    drain();
    expect(output).toHaveBeenCalledTimes(SEMANTIC_CAPS.dialog + 1);
    capture.stop();
  });
});
