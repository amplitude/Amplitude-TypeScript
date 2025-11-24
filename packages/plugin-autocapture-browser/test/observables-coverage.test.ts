import { Observable, getGlobalScope } from '@amplitude/analytics-core';
import { TimestampedEvent } from '../src/helpers';

jest.mock('@amplitude/analytics-core', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const actual = jest.requireActual('@amplitude/analytics-core');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    ...actual,
    getGlobalScope: jest.fn(),
  };
});

const mockGetGlobalScope = getGlobalScope as jest.Mock;

import {
  createClickObservable,
  createScrollObservable,
  createMutationObservable,
  createExposureObservable,
} from '../src/observables';

describe('Observables Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when getGlobalScope returns undefined', () => {
    beforeEach(() => {
      mockGetGlobalScope.mockReturnValue(undefined);
    });

    test('createClickObservable should handle undefined global scope safely', () => {
      const observable = createClickObservable();
      const subscription = observable.subscribe(() => {
        return;
      });
      subscription.unsubscribe();
      // Should not throw
      expect(mockGetGlobalScope).toHaveBeenCalled();
    });

    test('createScrollObservable should handle undefined global scope safely', () => {
      const observable = createScrollObservable();
      const subscription = observable.subscribe(() => {
        return;
      });
      subscription.unsubscribe();
      // Should not throw
      expect(mockGetGlobalScope).toHaveBeenCalled();
    });

    test('createExposureObservable should handle undefined global scope safely', () => {
      const mutationObservable = new Observable<TimestampedEvent<MutationRecord[]>>(() => {
        return;
      });
      const observable = createExposureObservable(mutationObservable, ['div']);
      const subscription = observable.subscribe(() => {
        return;
      });
      subscription.unsubscribe();
      // Should not throw
      expect(mockGetGlobalScope).toHaveBeenCalled();
    });
  });

  describe('createMutationObservable', () => {
    test('should handle missing document.body safely', () => {
      // Save original body
      const originalBody = document.body;
      // Delete body
      Object.defineProperty(document, 'body', { value: null, configurable: true });

      mockGetGlobalScope.mockReturnValue(window); // Ensure global scope is present

      const observable = createMutationObservable();
      const subscription = observable.subscribe(() => {
        return;
      });

      subscription.unsubscribe();

      // Restore body
      Object.defineProperty(document, 'body', { value: originalBody, configurable: true });

      // Verify it didn't throw and executed safely
      expect(true).toBe(true);
    });
  });
});
