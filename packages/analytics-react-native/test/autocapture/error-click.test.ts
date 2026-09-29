import {
  createErrorClickTracker,
  getErrorClickEventProperties,
  ReactNativeErrorEvent,
} from '../../src/autocapture/error-click';

describe('error-click', () => {
  let errorClickTracker: ReturnType<typeof createErrorClickTracker>;
  let handler: jest.Mock;

  const PROPERTIES: Record<string, unknown> = { '[Amplitude] Target Test ID': 'button-a' };
  const ERROR: ReactNativeErrorEvent = {
    kind: 'error',
    message: 'Something failed',
    stack: 'Error stack',
    filename: 'App.tsx',
    lineNumber: 10,
    columnNumber: 20,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    handler = jest.fn();
    errorClickTracker = createErrorClickTracker(handler);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('tracks an error click when an error follows a click within two seconds', () => {
    errorClickTracker.registerClickEvent(PROPERTIES);
    errorClickTracker.registerErrorEvent(ERROR);

    expect(handler).toHaveBeenCalledWith({
      error: ERROR,
      eventProperties: PROPERTIES,
    });
  });

  test('does not track an error without a preceding click', () => {
    errorClickTracker.registerErrorEvent(ERROR);

    expect(handler).not.toHaveBeenCalled();
  });

  test('does not track an error after the click window expires', () => {
    errorClickTracker.registerClickEvent(PROPERTIES);
    jest.advanceTimersByTime(2_000);
    errorClickTracker.registerErrorEvent(ERROR);

    expect(handler).not.toHaveBeenCalled();
  });

  test('uses the latest click properties', () => {
    const latestProperties = { '[Amplitude] Target Test ID': 'button-b' };
    errorClickTracker.registerClickEvent(PROPERTIES);
    errorClickTracker.registerClickEvent(latestProperties);
    errorClickTracker.registerErrorEvent(ERROR);

    expect(handler).toHaveBeenCalledWith({
      error: ERROR,
      eventProperties: latestProperties,
    });
  });

  test('clears the click window after tracking', () => {
    errorClickTracker.registerClickEvent(PROPERTIES);
    errorClickTracker.registerErrorEvent(ERROR);
    errorClickTracker.registerErrorEvent(ERROR);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('cancels a pending click window through the returned unsubscribe', () => {
    const unsubscribe = errorClickTracker.registerClickEvent(PROPERTIES);
    unsubscribe?.();
    errorClickTracker.registerErrorEvent(ERROR);

    expect(handler).not.toHaveBeenCalled();
  });

  test('maps error click data to browser-compatible event properties', () => {
    expect(
      getErrorClickEventProperties({
        error: ERROR,
        eventProperties: PROPERTIES,
      }),
    ).toEqual({
      '[Amplitude] Kind': 'error',
      '[Amplitude] Message': 'Something failed',
      '[Amplitude] Stack': 'Error stack',
      '[Amplitude] Filename': 'App.tsx',
      '[Amplitude] Line Number': 10,
      '[Amplitude] Column Number': 20,
      ...PROPERTIES,
    });
  });
});
