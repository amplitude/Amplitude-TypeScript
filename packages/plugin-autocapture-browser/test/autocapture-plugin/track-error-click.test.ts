/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-empty-function */

import { BrowserClient, Observable } from '@amplitude/analytics-core';
import { trackErrorClicks } from '../../src/autocapture/track-error-click';
import { AMPLITUDE_ELEMENT_ERROR_CLICKED_EVENT } from '../../src/constants';
import { ObservablesEnum } from '../../src/autocapture-plugin';
import { AllWindowObservables } from '../../src/frustration-plugin';
import { MouseButton } from '../../src/helpers';

describe('trackErrorClicks', () => {
  let mockAmplitude: jest.Mocked<BrowserClient>;
  let clickObservable: any;
  let mutationObservable: any;
  let navigateObservable: any;
  let browserErrorObservable: any;
  let allObservables: AllWindowObservables;
  let shouldTrackErrorClick: jest.Mock;
  let clickObserver: any;
  let browserErrorObserver: any;
  let subscription: ReturnType<typeof trackErrorClicks>;

  beforeEach(() => {
    mockAmplitude = {
      track: jest.fn(),
    } as any;

    clickObservable = new Observable<any>((observer) => {
      clickObserver = observer;
    });
    mutationObservable = new Observable<any>(() => {});
    navigateObservable = new Observable<any>(() => {});
    browserErrorObservable = new Observable<any>((observer) => {
      browserErrorObserver = observer;
    });
    allObservables = {
      [ObservablesEnum.ClickObservable]: clickObservable,
      [ObservablesEnum.MutationObservable]: mutationObservable,
      [ObservablesEnum.NavigateObservable]: navigateObservable,
      [ObservablesEnum.BrowserErrorObservable]: browserErrorObservable,
    };
    shouldTrackErrorClick = jest.fn().mockReturnValue(true);

    subscription = trackErrorClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackErrorClick,
    });

    jest.useFakeTimers();
  });

  afterEach(() => {
    subscription?.unsubscribe();
    jest.clearAllMocks();
  });

  it('should track error click when error occurs after a click', async () => {
    const mockElement = document.createElement('button');

    // Simulate a click
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
        button: MouseButton.LEFT_OR_TOUCH_CONTACT,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-button' },
      type: 'click',
    });

    // Simulate an error shortly after
    browserErrorObserver.next({
      event: {
        kind: 'error',
        message: 'Test error message',
        stack: 'Error stack trace',
        filename: 'test.js',
        lineNumber: 42,
        columnNumber: 10,
      },
      timestamp: Date.now(),
      type: 'error',
    });

    await jest.runAllTimersAsync();

    expect(mockAmplitude.track).toHaveBeenCalledWith(
      AMPLITUDE_ELEMENT_ERROR_CLICKED_EVENT,
      expect.objectContaining({
        ['[Amplitude] Kind']: 'error',
        ['[Amplitude] Message']: 'Test error message',
        ['[Amplitude] Stack']: 'Error stack trace',
        ['[Amplitude] Filename']: 'test.js',
        ['[Amplitude] Line Number']: 42,
        ['[Amplitude] Column Number']: 10,
        id: 'test-button',
      }),
    );
  });

  it('should not track error when no click occurred before', async () => {
    // Simulate an error without any preceding click
    browserErrorObserver.next({
      event: {
        kind: 'error',
        message: 'Test error message',
        stack: 'Error stack trace',
        filename: 'test.js',
        lineNumber: 42,
        columnNumber: 10,
      },
      timestamp: Date.now(),
      type: 'error',
    });

    await jest.runAllTimersAsync();

    expect(mockAmplitude.track).not.toHaveBeenCalled();
  });

  it('should not track error click if click with no error', async () => {
    const mockElement = document.createElement('button');

    // Simulate a click
    clickObserver.next({
      event: {
        target: mockElement,
        clientX: 100,
        clientY: 100,
        button: MouseButton.LEFT_OR_TOUCH_CONTACT,
      },
      timestamp: Date.now(),
      closestTrackedAncestor: mockElement,
      targetElementProperties: { id: 'test-button' },
      type: 'click',
    });

    await jest.runAllTimersAsync();

    expect(mockAmplitude.track).not.toHaveBeenCalled();
  });
});
