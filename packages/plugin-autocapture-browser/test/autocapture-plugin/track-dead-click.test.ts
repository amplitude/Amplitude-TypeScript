/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */

import { Subject } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
import { _overrideDeadClickConfig, trackDeadClick } from '../../src/autocapture/track-dead-click';
import { AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT } from '../../src/constants';
import { AllWindowObservables, ObservablesEnum } from '../../src/autocapture-plugin';
import { DEFAULT_DEAD_CLICK_WINDOW_MS } from '@amplitude/analytics-core';

describe('trackDeadClick', () => {
  let mockAmplitude: jest.Mocked<BrowserClient>;
  let clickObservable: Subject<any>;
  let mutationObservable: Subject<any>;
  let navigateObservable: Subject<any>;
  let allObservables: AllWindowObservables;
  let shouldTrackDeadClick: jest.Mock;
  let getEventProperties: jest.Mock;

  beforeAll(() => {
    // reduce the dead click timeout to 5ms to speed up the test
    _overrideDeadClickConfig(5);
  });

  beforeEach(() => {
    mockAmplitude = {
      track: jest.fn(),
    } as any;

    clickObservable = new Subject();
    mutationObservable = new Subject();
    navigateObservable = new Subject();
    allObservables = {
      [ObservablesEnum.ClickObservable]: clickObservable,
      [ObservablesEnum.ChangeObservable]: new Subject(),
      [ObservablesEnum.NavigateObservable]: navigateObservable,
      [ObservablesEnum.MutationObservable]: mutationObservable,
    };
    shouldTrackDeadClick = jest.fn().mockReturnValue(true);
    getEventProperties = jest.fn().mockReturnValue({ id: 'test-element' });

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should track dead click when no mutation or navigation occurs', () => {
    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate a click
    clickObservable.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Wait for the dead click timeout
    jest.advanceTimersByTime(DEFAULT_DEAD_CLICK_WINDOW_MS + 1000);
    expect(mockAmplitude.track).toHaveBeenCalledWith(
      AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT,
      expect.objectContaining({
        ['[Amplitude] X']: 100,
        ['[Amplitude] Y']: 100,
        id: 'test-element',
      }),
      expect.any(Object),
    );
    subscription.unsubscribe();
  });

  it('should not track when mutation occurs after click', () => {
    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    // Create a mock element
    const mockElement = document.createElement('button');

    // Simulate a click
    clickObservable.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Simulate a mutation shortly after
    mutationObservable.next([{ type: 'childList' }]);
    jest.runAllTimers();

    // Wait for the dead click timeout
    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('should not track when navigation occurs after click', () => {
    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate a click
    clickObservable.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Simulate a navigation shortly after
    jest.advanceTimersByTime(1);
    navigateObservable.next({ type: 'navigate' });
    jest.runAllTimers();
    jest.advanceTimersByTime(DEFAULT_DEAD_CLICK_WINDOW_MS + 1000);

    // Wait for the dead click timeout
    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('should not track elements that are not in the allowed list', () => {
    shouldTrackDeadClick.mockReturnValue(false);

    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    const mockElement = document.createElement('div');

    // Simulate a click
    clickObservable.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Wait for the dead click timeout
    jest.advanceTimersByTime(DEFAULT_DEAD_CLICK_WINDOW_MS + 1000);
    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('should not track when target is _blank', () => {
    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    const mockElement = document.createElement('a');
    mockElement.setAttribute('target', '_blank');

    clickObservable.next({
      event: {
        target: mockElement,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Wait for the dead click timeout
    jest.advanceTimersByTime(DEFAULT_DEAD_CLICK_WINDOW_MS + 1000);
    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('should throttle multiple dead clicks', () => {
    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    const mockElement = document.createElement('div');

    // Simulate multiple clicks
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(i);
      clickObservable.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: Date.now(),
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    // Wait for the dead click timeout plus some extra time for all clicks
    jest.advanceTimersByTime(100);
    expect(mockAmplitude.track).toHaveBeenCalledTimes(1); // Only one dead click should be tracked
    subscription.unsubscribe();
  });
});
