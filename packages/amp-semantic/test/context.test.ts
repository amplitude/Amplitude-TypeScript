import { contextRecorder } from '../src/recorders/context';
import { HostSignals, RecorderContext, SemanticFamily } from '../src/types';

function setup(families: SemanticFamily[] = ['context']) {
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
    canEmit: () => true,
    hasCapacity: () => true,
    clearDropped: jest.fn(),
    dropped: jest.fn(() => ({})),
    on: jest.fn((name: keyof HostSignals, callback: (value: never) => void) => {
      signals[name] = callback;
      return () => delete signals[name];
    }),
  } as unknown as RecorderContext;
  const cleanups = [contextRecorder]
    .filter((recorder) => recorder.families.some((family) => families.includes(family)))
    .map((recorder) => recorder.setup(context));
  const cleanup = () => cleanups.forEach((stop) => stop());
  return { context, cleanup, signals };
}

describe('context recorder', () => {
  afterEach(() => {
    jest.useRealTimers();
    document.head.innerHTML = '';
    jest.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });
  });

  test('emits one context per host snapshot', () => {
    document.head.innerHTML = '<style>body { color: red; }</style>';
    const { context, cleanup, signals } = setup();
    expect(context.emit).not.toHaveBeenCalled();
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
    expect(context.emit).toHaveBeenCalledTimes(2);
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
    jest.mocked(context.dropped).mockReturnValue({ context: 3 });
    signals.snapshot?.(undefined as never);
    expect(context.emit).toHaveBeenCalledWith(
      'context',
      expect.objectContaining({
        css: { total: 1, inlined: 0, unreadable: 1 },
        caps_hit: { context: 3 },
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

  test('attaches no browser listeners when browser families are disabled', () => {
    const documentListener = jest.spyOn(document, 'addEventListener');
    const windowListener = jest.spyOn(window, 'addEventListener');
    const { cleanup } = setup(['context']);
    expect(documentListener).not.toHaveBeenCalled();
    expect(windowListener).not.toHaveBeenCalled();
    cleanup();
  });
});

test('clears dropped counts only after successful context delivery', () => {
  const { context, signals, cleanup } = setup();
  jest.mocked(context.emit).mockReturnValue(false);
  signals.snapshot?.(undefined as never);
  expect(context.clearDropped).not.toHaveBeenCalled();
  jest.mocked(context.emit).mockReturnValue(true);
  signals.snapshot?.(undefined as never);
  expect(context.clearDropped).toHaveBeenCalledTimes(1);
  cleanup();
});
