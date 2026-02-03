/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */

import { BrowserClient, Observable } from '@amplitude/analytics-core';
import { trackDeadClick } from '../../src/autocapture/track-dead-click';
import { AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT } from '../../src/constants';
import { ObservablesEnum } from '../../src/autocapture-plugin';
import { AllWindowObservables } from '../../src/frustration-plugin';

describe('trackDeadClick', () => {
  let mockAmplitude: jest.Mocked<BrowserClient>;
  let clickObservable: any;
  let mutationObservable: any;
  let navigateObservable: any;
  let browserErrorObservable: any;
  let allObservables: AllWindowObservables;
  let shouldTrackDeadClick: jest.Mock;
  let getEventProperties: jest.Mock;
  let clickObserver: any;
  let mutationObserver: any;
  let navigateObserver: any;
  let subscription: any;

  beforeEach(() => {
    mockAmplitude = {
      track: jest.fn(),
    } as any;

    clickObservable = new Observable<any>((observer) => {
      clickObserver = observer;
    });
    mutationObservable = new Observable<any>((observer) => {
      mutationObserver = observer;
    });
    navigateObservable = new Observable<any>((observer) => {
      navigateObserver = observer;
    });
    browserErrorObservable = new Observable<any>((/* observer */) => {
      //browserErrorObserver = observer;
    });
    allObservables = {
      [ObservablesEnum.ClickObservable]: clickObservable,
      [ObservablesEnum.MutationObservable]: mutationObservable,
      [ObservablesEnum.NavigateObservable]: navigateObservable,
      [ObservablesEnum.BrowserErrorObservable]: browserErrorObservable,
    };
    shouldTrackDeadClick = jest.fn().mockReturnValue(true);
    getEventProperties = jest.fn().mockReturnValue({ id: 'test-element' });

    jest.useFakeTimers();

    subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });
  });

  afterEach(() => {
    subscription?.unsubscribe();
  });

  it('should track dead click when no mutation or navigation occurs', async () => {
    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate a click
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
        button: 0,
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
    navigateObserver.complete();
  });

  it('should not track dead click on right click', async () => {
    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate a right click
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
        button: 2, // right click button
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
      type: 'click',
    });

    // Wait for the dead click timeout
    await jest.runAllTimersAsync();
    expect(mockAmplitude.track).not.toHaveBeenCalled();

    subscription?.unsubscribe();
    mutationObserver.complete();
    navigateObserver.complete();
  });

  it('should not track when mutation occurs after click', async () => {
    // Create a mock element
    const mockElement = document.createElement('button');

    // Simulate a click
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
        button: 0,
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
    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate a click
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
        button: 0,
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
    subscription?.unsubscribe();
    shouldTrackDeadClick.mockReturnValue(false);

    subscription = trackDeadClick({
      amplitude: mockAmplitude,
      allObservables,
      getEventProperties,
      shouldTrackDeadClick,
    });

    const mockElement = document.createElement('div');

    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
        button: 0,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Wait for the dead click timeout
    await jest.runAllTimersAsync();
    expect(mockAmplitude.track).not.toHaveBeenCalled();
  });

  it('should not track when target is _blank', async () => {
    const mockElement = document.createElement('a');
    mockElement.setAttribute('target', '_blank');

    clickObserver.next({
      event: {
        target: mockElement,
        button: 0,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-element' },
    });

    // Wait for the dead click timeout
    await jest.runAllTimersAsync();
    expect(mockAmplitude.track).not.toHaveBeenCalled();
  });

  it('should throttle multiple dead clicks', async () => {
    const mockElement = document.createElement('div');

    // Simulate multiple clicks
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(i);
      clickObserver.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
          button: 0,
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
