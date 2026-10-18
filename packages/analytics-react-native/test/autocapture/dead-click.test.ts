import { createDeadClickTracker, getDeadClickEventProperties } from '../../src/autocapture/dead-click';

describe('dead-click', () => {
  const COORDINATES = { x: 100, y: 200 };
  const PROPERTIES = { '[Amplitude] Target Test ID': 'button' };

  let handler: jest.Mock;
  let deadClickTracker: ReturnType<typeof createDeadClickTracker>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    handler = jest.fn();
    deadClickTracker = createDeadClickTracker(handler);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('ignores clicks while session replay is not providing interface signals', () => {
    deadClickTracker.registerClickEvent(COORDINATES, PROPERTIES);
    jest.advanceTimersByTime(3500);

    expect(handler).not.toHaveBeenCalled();
  });

  test('tracks a dead click when no interface change is reported before timeout', () => {
    const time = Date.now();
    deadClickTracker.setProvidingInterfaceSignals(true);
    deadClickTracker.registerClickEvent(COORDINATES, PROPERTIES);

    jest.advanceTimersByTime(3500);

    expect(handler).toHaveBeenCalledWith({
      time,
      eventProperties: PROPERTIES,
      coordinates: COORDINATES,
    });
  });

  test('clears pending clicks when an interface change follows them', () => {
    deadClickTracker.setProvidingInterfaceSignals(true);
    deadClickTracker.registerClickEvent(COORDINATES, PROPERTIES);

    jest.advanceTimersByTime(100);
    deadClickTracker.registerInterfaceChange(Date.now());
    jest.advanceTimersByTime(3500);

    expect(handler).not.toHaveBeenCalled();
  });

  test('resets pending clicks when session replay stops providing interface signals', () => {
    deadClickTracker.setProvidingInterfaceSignals(true);
    deadClickTracker.registerClickEvent(COORDINATES, PROPERTIES);
    deadClickTracker.setProvidingInterfaceSignals(false);

    jest.advanceTimersByTime(3500);

    expect(handler).not.toHaveBeenCalled();
  });

  test('adds coordinates to event properties', () => {
    expect(
      getDeadClickEventProperties({
        time: Date.now(),
        eventProperties: PROPERTIES,
        coordinates: COORDINATES,
      }),
    ).toEqual({
      ...PROPERTIES,
      '[Amplitude] X Coordinate': 100,
      '[Amplitude] Y Coordinate': 200,
    });
  });
});
