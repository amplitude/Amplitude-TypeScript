import { createHelpers } from '../src/helpers';
import { feedbackRecorder } from '../src/recorders/feedback';
import { recorderContext } from './page-feedback-helpers';
import { replaySource } from './replay-feedback-helpers';

const flush = () => jest.advanceTimersByTime(100);
function setup(disabled: Parameters<typeof recorderContext>[0] = []) {
  const fixture = recorderContext(disabled);
  const replay = replaySource(fixture);
  const cleanup = feedbackRecorder.setup(fixture.context);
  replay.snapshot();
  flush();
  return { ...fixture, replay, cleanup };
}

describe('replay-driven feedback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    jest.spyOn(window.performance, 'now').mockReturnValue(0);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('uses recorded additions without a DOM observer, selector scan, or tree walker', () => {
    const observer = jest.spyOn(window, 'MutationObserver');
    const query = jest.spyOn(Element.prototype, 'querySelectorAll');
    const walk = jest.spyOn(document, 'createTreeWalker');
    const { replay, emit, cleanup } = setup();
    document.body.innerHTML = '<section><div role="dialog" aria-label="One"></div></section>';
    replay.add(document.body.firstChild!);
    expect(emit).not.toHaveBeenCalled();
    flush();
    expect(emit).toHaveBeenCalledWith('dialog', expect.objectContaining({ name: 'One', state: 'open' }));
    expect(observer).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(walk).not.toHaveBeenCalled();
    cleanup();
  });

  test('does not discover DOM changes absent from accepted replay input', () => {
    const { emit, cleanup } = setup();
    document.body.innerHTML = '<div role="alert">Not recorded</div><dialog open></dialog>';
    flush();
    expect(emit).not.toHaveBeenCalled();
    cleanup();
  });

  test('seeds existing dialogs silently and closes them after mirror removal with stable identity', () => {
    document.body.innerHTML = '<section><dialog open aria-label="Existing"></dialog></section>';
    const { replay, emit, cleanup } = setup();
    const id = replay.id(document.querySelector('dialog')!);
    expect(emit).not.toHaveBeenCalled();
    replay.remove(document.querySelector('section')!);
    flush();
    expect(emit).toHaveBeenCalledWith(
      'dialog',
      expect.objectContaining({ id, state: 'closed', name: null, name_source: 'masked' }),
    );
    cleanup();
  });

  test('preserves snapshot baseline when live DOM changes before its deferred processing', () => {
    document.body.innerHTML = '<dialog></dialog>';
    const fixture = recorderContext();
    const replay = replaySource(fixture);
    const cleanup = feedbackRecorder.setup(fixture.context);
    replay.snapshot();
    const dialog = document.querySelector('dialog')!;
    dialog.setAttribute('open', '');
    replay.attrs(dialog, 'open');
    flush();
    expect(fixture.emit).toHaveBeenCalledWith('dialog', expect.objectContaining({ state: 'open' }));
    replay.snapshot();
    flush();
    expect(fixture.emit).toHaveBeenCalledTimes(1);
    cleanup();
  });

  test('finds nested notices, coalesces latest text, and correlates clicks', () => {
    const { replay, emit, click, cleanup } = setup();
    click(Date.now());
    document.body.innerHTML = '<section><div role="alert">First</div></section>';
    replay.add(document.body.firstChild!);
    flush();
    expect(emit).toHaveBeenLastCalledWith(
      'notice',
      expect.objectContaining({ text: 'First', role: 'alert', cause_click_ts: expect.any(Number) }),
    );
    const region = document.querySelector('[role="alert"]')!;
    region.firstChild!.textContent = 'Second';
    replay.text(region.firstChild!);
    flush();
    region.firstChild!.textContent = 'Latest';
    replay.text(region.firstChild!);
    flush();
    expect(emit).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(500);
    expect(emit).toHaveBeenLastCalledWith('notice', expect.objectContaining({ text: 'Latest' }));
    expect(emit).toHaveBeenCalledTimes(2);
    cleanup();
  });

  test('updates parent live regions for child additions/removals and deduplicates a batch', () => {
    document.body.innerHTML = '<div role="status">Original</div>';
    const { replay, emit, cleanup } = setup();
    const region = document.body.firstElementChild!;
    const child = document.createElement('span');
    child.textContent = 'Added';
    region.appendChild(child);
    replay.add(child);
    flush();
    expect(emit).toHaveBeenCalledWith('notice', expect.objectContaining({ text: 'OriginalAdded' }));
    replay.remove(child);
    flush();
    jest.advanceTimersByTime(500);
    expect(emit).toHaveBeenLastCalledWith('notice', expect.objectContaining({ text: 'Original' }));
    cleanup();
  });

  test('retains masking, blocking, provenance and notice text limits', () => {
    const fixture = recorderContext();
    const replay = replaySource(fixture);
    fixture.context.host.getPrivacy = () => ({ defaultMaskLevel: 'light' });
    fixture.context.helpers = createHelpers(fixture.context.host);
    const cleanup = feedbackRecorder.setup(fixture.context);
    document.body.innerHTML =
      '<section><div role="status">Public <span class="amp-mask">Secret</span></div><div class="amp-block"><div role="alert">Blocked</div></div><div aria-live="polite">' +
      'x'.repeat(300) +
      '</div><dialog open aria-label="Confirm"></dialog><dialog open aria-label="PRIVATE" class="amp-mask"></dialog></section>';
    replay.add(document.body.firstChild!);
    flush();
    expect(fixture.emit).toHaveBeenCalledTimes(4);
    expect(fixture.emit).toHaveBeenCalledWith('notice', expect.objectContaining({ text: null }));
    expect(fixture.emit).toHaveBeenCalledWith('notice', expect.objectContaining({ text: 'x'.repeat(199) + '…' }));
    expect(fixture.emit).toHaveBeenCalledWith(
      'dialog',
      expect.objectContaining({ name: 'Confirm', name_source: 'aria-label' }),
    );
    expect(fixture.emit).toHaveBeenCalledWith('dialog', expect.objectContaining({ name: null, name_source: 'masked' }));
    expect(JSON.stringify(fixture.emit.mock.calls)).not.toMatch(/Secret|Blocked|PRIVATE/);
    cleanup();
  });

  test('handles hidden ancestors, native open, and ignores unrelated attributes', () => {
    document.body.innerHTML = '<section hidden><dialog open aria-label="Panel"></dialog></section>';
    const { replay, emit, cleanup } = setup();
    const section = document.querySelector('section')!;
    section.hidden = false;
    replay.attrs(section, 'hidden');
    flush();
    expect(emit).toHaveBeenLastCalledWith('dialog', expect.objectContaining({ state: 'open' }));
    const dialog = document.querySelector('dialog')!;
    dialog.removeAttribute('open');
    replay.attrs(dialog, 'open');
    flush();
    expect(emit).toHaveBeenLastCalledWith('dialog', expect.objectContaining({ state: 'closed' }));
    emit.mockClear();
    section.className = 'unrelated';
    replay.attrs(section, 'class');
    flush();
    expect(emit).not.toHaveBeenCalled();
    cleanup();
  });

  test('rechecks connected dialogs moved beneath a hidden ancestor', () => {
    document.body.innerHTML = '<section><dialog open></dialog></section><aside hidden></aside>';
    const { replay, emit, cleanup } = setup();
    const wrapper = document.querySelector('section')!;
    const previousParent = replay.id(document.body);
    const wrapperId = replay.id(wrapper);
    document.querySelector('aside')!.appendChild(wrapper);
    // rrweb can serialize just the moved ancestor, without its already-known children.
    replay.mutation({
      removes: [{ parentId: previousParent, id: wrapperId }],
      adds: [
        {
          parentId: replay.id(wrapper.parentNode!),
          node: { id: wrapperId, type: 2, tagName: 'section', attributes: {}, childNodes: [] },
        },
      ],
    });
    flush();
    expect(emit).toHaveBeenCalledWith('dialog', expect.objectContaining({ state: 'closed' }));
    cleanup();
  });

  test('does not repeat notices for dialog attributes; includes region context', () => {
    document.body.innerHTML = '<div role="dialog"><div role="status">Ready</div></div>';
    const { context, replay, emit, click, cleanup } = setup();
    context.helpers.container = () => ({ id: 10, role: 'main', name: 'Workspace' });
    click(Date.now() - 4000);
    const text = document.querySelector('[role="status"]')!.firstChild!;
    text.textContent = 'Changed';
    replay.text(text);
    flush();
    expect(emit).toHaveBeenCalledWith(
      'notice',
      expect.objectContaining({ text: 'Changed', cause_click_ts: null, region: { role: 'main', name: 'Workspace' } }),
    );
    emit.mockClear();
    const dialog = document.body.firstElementChild!;
    dialog.setAttribute('aria-hidden', 'true');
    replay.attrs(dialog, 'aria-hidden');
    flush();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('dialog', expect.objectContaining({ state: 'closed' }));
    cleanup();
  });

  test('drops trailing notices on blocking, removal, and cleanup', () => {
    const { replay, emit, cleanup } = setup();
    document.body.innerHTML = '<div role="alert">First</div>';
    const region = document.body.firstElementChild!;
    replay.add(region);
    flush();
    region.firstChild!.textContent = 'Private';
    replay.text(region.firstChild!);
    flush();
    region.className = 'amp-block';
    jest.advanceTimersByTime(600);
    expect(emit).toHaveBeenCalledTimes(1);
    region.className = '';
    replay.text(region.firstChild!);
    replay.remove(region);
    flush();
    cleanup();
    jest.advanceTimersByTime(5000);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  test('clears removed names after a stricter privacy policy', () => {
    const { context, replay, emit, cleanup } = setup();
    document.body.innerHTML = '<dialog open aria-label="Sensitive account"></dialog>';
    const dialog = document.body.firstElementChild!;
    replay.add(dialog);
    flush();
    const opened = emit.mock.calls[0][1];
    context.host.getPrivacy = () => ({ defaultMaskLevel: 'conservative' });
    replay.remove(dialog);
    flush();
    expect(emit).toHaveBeenLastCalledWith(
      'dialog',
      expect.objectContaining({ ...opened, name: null, name_source: 'masked', state: 'closed', visible: false }),
    );
    cleanup();
  });

  test('supports independently disabled families and requires a replay node resolver', () => {
    const { replay, emit, cleanup } = setup(['notice']);
    document.body.innerHTML = '<section><div role="alert">Ignored</div><dialog open></dialog></section>';
    replay.add(document.body.firstChild!);
    flush();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('dialog', expect.anything());
    cleanup();
    const fixture = recorderContext();
    const on = jest.spyOn(fixture.context, 'on');
    feedbackRecorder.setup(fixture.context)();
    expect(on).not.toHaveBeenCalled();
  });
});
