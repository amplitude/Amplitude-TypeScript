import { lifecycleRecorder } from '../src/recorders/lifecycle';
import { HostSignals, RecorderContext, SemanticFamily } from '../src/types';

function setup(families: SemanticFamily[] = ['context', 'recording', 'visibility', 'lifecycle']) {
  const signals: Partial<Record<keyof HostSignals, (value: never) => void>> = {};
  const context = {
    host: {
      document,
      window,
      sdk: 'test-sdk@1',
      getPrivacy: () => ({ defaultMaskLevel: 'medium' }),
      getAnalyticsContext: () => ({ present: true, autocapture: ['elementInteractions'] }),
    },
    enabled: (family: SemanticFamily) => families.includes(family),
    emit: jest.fn(() => true),
    dropped: jest.fn(() => ({})),
    on: jest.fn((name: keyof HostSignals, callback: (value: never) => void) => {
      signals[name] = callback;
      return () => delete signals[name];
    }),
  } as unknown as RecorderContext;
  const cleanup = lifecycleRecorder.setup(context);
  return { context, cleanup, signals };
}

describe('lifecycle recorder', () => {
  afterEach(() => {
    jest.useRealTimers();
    document.head.innerHTML = '';
    jest.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });
  });

  test('emits one context per host snapshot and no context on recording signal', () => {
    document.head.innerHTML = '<style>body { color: red; }</style>';
    const { context, cleanup, signals } = setup();
    signals.recording?.({ state: 'start', reason: 'init' } as never);
    expect(context.emit).toHaveBeenCalledTimes(1);
    signals.snapshot?.(undefined as never);
    expect(context.emit).toHaveBeenLastCalledWith(
      'context',
      expect.objectContaining({
        sdk: 'test-sdk@1',
        mask: 'medium',
        device: 'desktop',
        css: { total: 1, inlined: 1, unreadable: 0 },
        analytics_sdk: { present: true, autocapture: ['elementInteractions'] },
      }),
    );
    signals.snapshot?.(undefined as never);
    expect(context.emit).toHaveBeenCalledTimes(3);
    cleanup();
    expect(signals).toEqual({});
  });

  test('captures initial hidden state and refreshes context without the visibility family', () => {
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const focused = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    jest.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('SemanticContextTest/1.0');
    const { context, cleanup, signals } = setup(['context']);
    signals.snapshot?.(undefined as never);
    expect(context.emit).toHaveBeenLastCalledWith(
      'context',
      expect.objectContaining({ visibility_state: 'hidden', focused: false, user_agent: 'SemanticContextTest/1.0' }),
    );
    visibility.mockReturnValue('visible');
    focused.mockReturnValue(true);
    signals.snapshot?.(undefined as never);
    expect(context.emit).toHaveBeenLastCalledWith(
      'context',
      expect.objectContaining({ visibility_state: 'visible', focused: true, user_agent: 'SemanticContextTest/1.0' }),
    );
    expect(context.emit).toHaveBeenCalledTimes(2);
    cleanup();
  });

  test('counts unreadable stylesheets and includes dropped counts', () => {
    const { context, cleanup, signals } = setup(['context']);
    const sheet = {
      get cssRules(): never {
        throw new Error('cross origin');
      },
    };
    jest.spyOn(document, 'styleSheets', 'get').mockReturnValue([sheet] as unknown as StyleSheetList);
    jest.mocked(context.dropped).mockReturnValue({ click: 3 });
    signals.snapshot?.(undefined as never);
    expect(context.emit).toHaveBeenCalledWith(
      'context',
      expect.objectContaining({
        css: { total: 1, inlined: 0, unreadable: 1 },
        caps_hit: { click: 3 },
      }),
    );
    cleanup();
  });

  test('does not count readable styles as inlined when stylesheet inlining is disabled', () => {
    document.head.innerHTML = '<style>body { color: red; }</style>';
    const { context, cleanup, signals } = setup(['context']);
    context.host.inlineStylesheet = false;
    context.host.getAnalyticsContext = undefined;
    context.host.getPrivacy = () => ({});
    signals.snapshot?.(undefined as never);
    expect(context.emit).toHaveBeenCalledWith(
      'context',
      expect.objectContaining({
        css: { total: 1, inlined: 0, unreadable: 0 },
        analytics_sdk: { present: false, autocapture: [] },
      }),
    );
    cleanup();
  });

  test.each([
    [600, 'mobile'],
    [900, 'tablet'],
    [1200, 'desktop'],
  ])('uses coarse pointer and width %s for %s', (width, device) => {
    const { context, cleanup, signals } = setup(['context']);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => ({ matches: true })) });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    signals.snapshot?.(undefined as never);
    expect(context.emit).toHaveBeenCalledWith('context', expect.objectContaining({ device }));
    cleanup();
  });

  test('captures visibility and persisted pageshow, and cleans up every listener', () => {
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { context, cleanup } = setup(['visibility', 'lifecycle']);
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow'));
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('freeze'));
    document.dispatchEvent(new Event('resume'));
    expect(context.emit).toHaveBeenCalledWith('visibility', {
      state: 'hidden',
      focused: false,
      trigger: 'visibilitychange',
    });
    for (const type of ['pageshow_bfcache', 'pageshow', 'pagehide', 'freeze', 'resume']) {
      expect(context.emit).toHaveBeenCalledWith('lifecycle', { type });
    }
    cleanup();
    jest.mocked(context.emit).mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('resume'));
    expect(context.emit).not.toHaveBeenCalled();
  });

  test('captures window focus changes, deduplicates state, ignores element focus, and tears down', () => {
    jest.useFakeTimers();
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const focused = jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { context, cleanup } = setup(['visibility']);
    window.dispatchEvent(new Event('focus'));
    expect(context.emit).not.toHaveBeenCalled();
    focused.mockReturnValue(false);
    document.body.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(context.emit).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(50);
    expect(context.emit).toHaveBeenLastCalledWith('visibility', {
      state: 'visible',
      focused: false,
      trigger: 'blur',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(context.emit).toHaveBeenCalledTimes(1);
    focused.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    jest.advanceTimersByTime(50);
    expect(context.emit).toHaveBeenLastCalledWith('visibility', {
      state: 'visible',
      focused: true,
      trigger: 'focus',
    });
    cleanup();
    focused.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(context.emit).toHaveBeenCalledTimes(2);
  });

  test('emits hidden immediately and coalesces the observed 3 ms / 35 ms return sequence', () => {
    jest.useFakeTimers();
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const focused = jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { context, cleanup } = setup(['visibility']);
    visibility.mockReturnValue('hidden');
    focused.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(context.emit).toHaveBeenCalledTimes(1);
    expect(context.emit).toHaveBeenLastCalledWith('visibility', {
      state: 'hidden',
      focused: false,
      trigger: 'visibilitychange',
    });
    jest.advanceTimersByTime(3);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    jest.advanceTimersByTime(32);
    focused.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    jest.advanceTimersByTime(49);
    expect(context.emit).toHaveBeenCalledTimes(1);
    // A duplicate does not push out the deadline or change its meaningful trigger.
    document.dispatchEvent(new Event('visibilitychange'));
    jest.advanceTimersByTime(1);
    expect(context.emit).toHaveBeenCalledTimes(2);
    expect(context.emit).toHaveBeenLastCalledWith('visibility', {
      state: 'visible',
      focused: true,
      trigger: 'focus',
    });
    cleanup();
  });

  test('a hidden transition replaces pending blur without a stale timer emission', () => {
    jest.useFakeTimers();
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const focused = jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { context, cleanup } = setup(['visibility']);
    focused.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(20);
    expect(context.emit).not.toHaveBeenCalled();
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(context.emit).toHaveBeenCalledTimes(1);
    expect(context.emit).toHaveBeenLastCalledWith('visibility', {
      state: 'hidden',
      focused: false,
      trigger: 'visibilitychange',
    });
    jest.runOnlyPendingTimers();
    expect(context.emit).toHaveBeenCalledTimes(1);
    cleanup();
  });

  test('drops transient focus churn but emits a settled visible unfocused state', () => {
    jest.useFakeTimers();
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const focused = jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { context, cleanup } = setup(['visibility']);
    focused.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(20);
    focused.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    jest.runOnlyPendingTimers();
    expect(context.emit).not.toHaveBeenCalled();
    focused.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(50);
    expect(context.emit).toHaveBeenCalledWith('visibility', {
      state: 'visible',
      focused: false,
      trigger: 'blur',
    });
    cleanup();
  });

  test.each(['stop', 'pagehide'])('cancels a pending visible observation on %s', (boundary) => {
    jest.useFakeTimers();
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { context, cleanup } = setup(['visibility']);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    if (boundary === 'stop') cleanup();
    else window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    jest.runOnlyPendingTimers();
    expect(context.emit).not.toHaveBeenCalled();
    cleanup();
  });

  test('attaches no browser listeners when browser families are disabled', () => {
    const documentListener = jest.spyOn(document, 'addEventListener');
    const windowListener = jest.spyOn(window, 'addEventListener');
    const { cleanup } = setup(['recording']);
    expect(documentListener).not.toHaveBeenCalled();
    expect(windowListener).not.toHaveBeenCalled();
    cleanup();
  });
});
