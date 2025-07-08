/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable jest/no-done-callback */
/* eslint-disable @typescript-eslint/unbound-method */

import { Subject } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
import { trackRageClicks } from '../../src/autocapture/track-rage-click';
import { AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../../src/constants';
import { AllWindowObservables, ObservablesEnum } from '../../src/autocapture-plugin';

describe('trackRageClicks', () => {
  let mockAmplitude: jest.Mocked<BrowserClient>;
  let clickObservable: Subject<any>;
  let allObservables: AllWindowObservables;
  let shouldTrackRageClick: jest.Mock;

  beforeAll(() => {
    // reduce the rage click window to 5ms to speed up the test
    //_overrideRageClickConfig(5, 5);
  });

  beforeEach(() => {
    mockAmplitude = {
      track: jest.fn(),
    } as any;

    clickObservable = new Subject();
    allObservables = {
      [ObservablesEnum.ClickObservable]: clickObservable,
      [ObservablesEnum.ChangeObservable]: new Subject(),
      [ObservablesEnum.NavigateObservable]: new Subject(),
      [ObservablesEnum.MutationObservable]: new Subject(),
    };
    shouldTrackRageClick = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should track rage clicks when threshold is met', (done) => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate 5 rapid clicks on the same element
    for (let i = 0; i < 5; i++) {
      clickObservable.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: Date.now() + i * 100, // Space clicks 100ms apart
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    // Wait for the buffer time to complete
    setTimeout(() => {
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
        expect.objectContaining({
          '[Amplitude] Click Count': 4,
          '[Amplitude] Clicks': expect.arrayContaining([
            expect.objectContaining({
              X: 100,
              Y: 100,
            }),
          ]),
          id: 'test-element',
        }),
        expect.any(Object),
      );
      subscription.unsubscribe();
      done();
    }, 100); // Wait slightly longer than the buffer window
  });

  it('should not track when clicks are below threshold', (done) => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create a mock element
    const mockElement = document.createElement('div');

    // Simulate only 3 clicks (below threshold)
    for (let i = 0; i < 3; i++) {
      clickObservable.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: Date.now() + i * 100,
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    setTimeout(() => {
      expect(mockAmplitude.track).not.toHaveBeenCalled();
      subscription.unsubscribe();
      done();
    }, 100);
  });

  it('should not track when clicks are on different elements', (done) => {
    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // Create two different mock elements
    const mockElement1 = document.createElement('div');
    const mockElement2 = document.createElement('div');

    // Simulate clicks alternating between elements
    for (let i = 0; i < 6; i++) {
      clickObservable.next({
        event: {
          target: i % 2 === 0 ? mockElement1 : mockElement2,
          clientX: 100,
          clientY: 100,
        },
        timestamp: Date.now() + i * 100,
        closestTrackedAncestor: i % 2 === 0 ? mockElement1 : mockElement2,
        targetElementProperties: { id: `test-element-${(i % 2) + 1}` },
      });
    }

    setTimeout(() => {
      expect(mockAmplitude.track).not.toHaveBeenCalled();
      subscription.unsubscribe();
      done();
    }, 100);
  });

  it('should not track div elements', (done) => {
    shouldTrackRageClick.mockReturnValue(false);

    const subscription = trackRageClicks({
      amplitude: mockAmplitude,
      allObservables,
      shouldTrackRageClick,
    });

    // element that is not tracked
    const mockElement = document.createElement('div');

    // Simulate 5 rapid clicks
    for (let i = 0; i < 5; i++) {
      clickObservable.next({
        event: {
          target: mockElement,
          clientX: 100,
          clientY: 100,
        },
        timestamp: Date.now() + i * 100,
        closestTrackedAncestor: mockElement,
        targetElementProperties: { id: 'test-element' },
      });
    }

    setTimeout(() => {
      expect(mockAmplitude.track).not.toHaveBeenCalled();
      subscription.unsubscribe();
      done();
    }, 100);
  });
});
