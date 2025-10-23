/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */

import { Subject } from 'rxjs';
import { BrowserClient, Observable } from '@amplitude/analytics-core';
import { _overrideDeadClickConfig, trackDeadClick } from '../../src/autocapture/track-dead-click';
import { AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT } from '../../src/constants';
import { AllWindowObservables, ObservablesEnum } from '../../src/autocapture-plugin';

describe('trackDeadClick', () => {
  let mockAmplitude: jest.Mocked<BrowserClient>;
  let clickObservable: Subject<any>;
  let clickObservableZen: any;
  //let mutationObservable: Subject<any>;
  let mutationObservableZen: any;
  let navigateObservableZen: any;
  // let navigateObservable: Subject<any>;
  let allObservables: AllWindowObservables;
  let shouldTrackDeadClick: jest.Mock;
  let getEventProperties: jest.Mock;
  let clickObserver: any;
  let mutationObserver: any;
  let navigateObserver: any;

  beforeAll(() => {
    // reduce the dead click timeout to 5ms to speed up the test
    _overrideDeadClickConfig(5);
  });

  beforeEach(() => {
    mockAmplitude = {
      track: jest.fn(),
    } as any;

    clickObservable = new Subject();
    clickObservableZen = new Observable<any>((observer) => {
      clickObserver = observer;
    });
    mutationObservableZen = new Observable<any>((observer) => {
      mutationObserver = observer;
    });
    navigateObservableZen = new Observable<any>((observer) => {
      navigateObserver = observer;
    });
    allObservables = {
      [ObservablesEnum.ClickObservable]: clickObservable,
      [ObservablesEnum.ChangeObservable]: new Subject(),
      [ObservablesEnum.NavigateObservable]: new Subject(),
      [ObservablesEnum.MutationObservable]: new Subject(),
      [ObservablesEnum.ClickObservableZen]: clickObservableZen,
      [ObservablesEnum.MutationObservableZen]: mutationObservableZen,
      [ObservablesEnum.NavigateObservableZen]: navigateObservableZen,
    };
    shouldTrackDeadClick = jest.fn().mockReturnValue(true);
    getEventProperties = jest.fn().mockReturnValue({ id: 'test-element' });

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should track dead click when no mutation or navigation occurs', async () => {
    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate a click
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
      type: 'click',
    });

    // Wait for the dead click timeout
    await jest.runAllTimersAsync();
    expect(mockAmplitude.track).toHaveBeenCalledWith(
      AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT,
      expect.objectContaining({
        ['[Amplitude] X']: 100,
        ['[Amplitude] Y']: 100,
        id: 'test-element',
      }),
      expect.any(Object),
    );

    subscription?.unsubscribe();
    mutationObserver.complete();
  });

  it('should not track when mutation occurs after click', async () => {
    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    // Create a mock element
    const mockElement = document.createElement('button');

    // Simulate a click
    clickObserver.next({
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
    mutationObserver.next([{ type: 'childList' }]);
    await jest.runAllTimersAsync();

    // Wait for the dead click timeout
    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });

  it('should not track when navigation occurs after click', async () => {
    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate a click
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
      type: 'click',
    });

    // Simulate a navigation shortly after
    navigateObserver.next({ type: 'navigate' });
    await jest.runAllTimersAsync();

    // Wait for the dead click timeout
    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });

  it('should not track elements that are not in the allowed list', async () => {
    shouldTrackDeadClick.mockReturnValue(false);

    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    const mockElement = document.createElement('div');

    // Simulate a click
    clickObserver.next({
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
    await jest.runAllTimersAsync();
    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });

  it('should not track when target is _blank', async () => {
    const subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    const mockElement = document.createElement('a');
    mockElement.setAttribute('target', '_blank');

    clickObserver.next({
      event: {
        target: mockElement,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Wait for the dead click timeout
    await jest.runAllTimersAsync();
    expect(mockAmplitude.track).not.toHaveBeenCalled();
    subscription?.unsubscribe();
  });

  it('should throttle multiple dead clicks', async () => {
    trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    const mockElement = document.createElement('div');

    // Simulate multiple clicks
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(i);
      clickObserver.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: Date.now(),
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
        type: 'click',
      });
    }

    // Wait for the dead click timeout plus some extra time for all clicks
    await jest.runAllTimersAsync();
    expect(mockAmplitude.track).toHaveBeenCalledTimes(1); // Only one dead click should be tracked
  });
});
