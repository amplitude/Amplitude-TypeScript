import { feedbackRecorder } from '../src/recorders/feedback';
import { recorderContext } from './page-feedback-helpers';

const mutations = async () => {
  await Promise.resolve();
  jest.advanceTimersByTime(20);
};

describe('feedback recorder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('finds nested live regions, batches latest text, throttles and correlates clicks', async () => {
    const { context, emit, click } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    click(Date.now());
    document.body.innerHTML = '<section><div role="alert">First</div></section>';
    await mutations();
    expect(emit).toHaveBeenLastCalledWith(
      'notice',
      expect.objectContaining({ text: 'First', role: 'alert', cause_click_ts: expect.any(Number) }),
    );
    const region = document.querySelector('[role="alert"]')!;
    region.textContent = 'Second';
    await mutations();
    region.textContent = 'Latest';
    await mutations();
    expect(emit).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(500);
    expect(emit).toHaveBeenLastCalledWith('notice', expect.objectContaining({ text: 'Latest' }));
    expect(emit).toHaveBeenCalledTimes(2);
    cleanup();
  });

  test('masks nested text, excludes blocked regions, and truncates notice text', async () => {
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    document.body.innerHTML =
      '<div role="status">Public <span class="amp-mask">Secret</span></div><div class="amp-block"><div role="alert">Blocked</div></div><div aria-live="polite">' +
      'x'.repeat(300) +
      '</div>';
    await mutations();
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('notice', expect.objectContaining({ text: null }));
    expect(emit).toHaveBeenCalledWith('notice', expect.objectContaining({ text: 'x'.repeat(200), role: 'live' }));
    cleanup();
  });

  test('tracks native dialog open/close and custom dialog removal with stable identity', async () => {
    document.body.innerHTML = '<dialog aria-label="Native"></dialog>';
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    const dialog = document.querySelector('dialog')!;
    dialog.setAttribute('open', '');
    await mutations();
    expect(emit).toHaveBeenLastCalledWith('dialog', expect.objectContaining({ name: 'Native', state: 'open' }));
    dialog.removeAttribute('open');
    await mutations();
    expect(emit).toHaveBeenLastCalledWith('dialog', expect.objectContaining({ state: 'closed', visible: false }));
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Modal"></div>';
    document.body.appendChild(wrapper);
    await mutations();
    const opened = emit.mock.calls[emit.mock.calls.length - 1][1];
    wrapper.remove();
    await mutations();
    expect(emit).toHaveBeenLastCalledWith(
      'dialog',
      expect.objectContaining({ ...opened, name: null, state: 'closed', visible: false }),
    );
    cleanup();
  });

  test('handles hidden ancestors and ignores unrelated attributes', async () => {
    document.body.innerHTML = '<section><div role="dialog" aria-label="Panel"></div></section>';
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    document.querySelector('section')!.hidden = true;
    await mutations();
    expect(emit).toHaveBeenLastCalledWith('dialog', expect.objectContaining({ state: 'closed' }));
    document.querySelector('section')!.hidden = false;
    await mutations();
    expect(emit).toHaveBeenLastCalledWith('dialog', expect.objectContaining({ state: 'open' }));
    emit.mockClear();
    document.querySelector('section')!.className = 'unrelated';
    await mutations();
    expect(emit).not.toHaveBeenCalled();
    cleanup();
  });

  test('cancels queued frames and trailing notices on cleanup', async () => {
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    document.body.innerHTML = '<div role="alert">First</div>';
    await mutations();
    document.querySelector('[role="alert"]')!.textContent = 'Pending';
    await mutations();
    cleanup();
    emit.mockClear();
    jest.advanceTimersByTime(5000);
    document.body.innerHTML = '<div role="alert">After cleanup</div>';
    await mutations();
    expect(emit).not.toHaveBeenCalled();
  });

  test('respects independently disabled families and installs no observer when both disabled', async () => {
    const { context, emit } = recorderContext(['notice']);
    const cleanup = feedbackRecorder.setup(context);
    document.body.innerHTML = '<div role="alert">Ignored</div><div role="dialog">Dialog</div>';
    await mutations();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('dialog', expect.anything());
    cleanup();
    const observer = jest.spyOn(window, 'MutationObserver');
    feedbackRecorder.setup(recorderContext(['notice', 'dialog']).context)();
    expect(observer).not.toHaveBeenCalled();
  });
  test('handles character data changes and does not replay notice text for dialog attributes', async () => {
    document.body.innerHTML = '<div role="dialog"><div role="status">Ready</div></div>';
    const { context, emit, click } = recorderContext();
    context.helpers.container = () => ({ id: 10, role: 'main', name: 'Workspace' });
    const cleanup = feedbackRecorder.setup(context);
    click(Date.now() - 4000);
    const text = document.querySelector('[role="status"]')?.firstChild as Text;
    text.data = 'Changed';
    await mutations();
    expect(emit).toHaveBeenLastCalledWith(
      'notice',
      expect.objectContaining({ text: 'Changed', cause_click_ts: null, region: { role: 'main', name: 'Workspace' } }),
    );
    emit.mockClear();
    document.querySelector('[role="dialog"]')?.setAttribute('aria-hidden', 'true');
    await mutations();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('dialog', expect.objectContaining({ state: 'closed' }));
    cleanup();
  });

  test('drops a trailing notice after its region is removed or becomes blocked', async () => {
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    document.body.innerHTML = '<div role="alert">First</div>';
    await mutations();
    const region = document.querySelector('[role="alert"]') as HTMLElement;
    region.textContent = 'Pending';
    await mutations();
    region.className = 'amp-block';
    jest.advanceTimersByTime(500);
    expect(emit).toHaveBeenCalledTimes(1);
    region.className = '';
    region.textContent = 'Removed';
    await Promise.resolve();
    region.remove();
    await mutations();
    expect(emit).toHaveBeenCalledTimes(1);
    cleanup();
  });
  test('never replays cached dialog names after removal changes privacy provenance', async () => {
    const { context, emit } = recorderContext();
    const cleanup = feedbackRecorder.setup(context);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Sensitive account');
    document.body.appendChild(dialog);
    await mutations();
    expect(emit).toHaveBeenLastCalledWith(
      'dialog',
      expect.objectContaining({ name: 'Sensitive account', state: 'open' }),
    );
    const previous = emit.mock.calls[emit.mock.calls.length - 1][1];
    // Simulate a stricter URL/remote privacy policy between opening and removal.
    context.host.getPrivacy = () => ({ defaultMaskLevel: 'conservative' });
    context.helpers.masked = () => true;
    context.helpers.name = () => ({ name: null, source: 'masked' });
    dialog.remove();
    await mutations();
    expect(emit).toHaveBeenLastCalledWith(
      'dialog',
      expect.objectContaining({ ...previous, name: null, state: 'closed', visible: false }),
    );
    cleanup();
  });
});
