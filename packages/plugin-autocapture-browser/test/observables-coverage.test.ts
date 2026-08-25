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
    const withoutBody = (run: () => void) => {
      const originalBody = document.body;
      Object.defineProperty(document, 'body', { value: null, configurable: true });
      try {
        run();
      } finally {
        Object.defineProperty(document, 'body', { value: originalBody, configurable: true });
      }
    };

    test('should observe the document element when document.body does not exist yet', () => {
      const observeSpy = jest.spyOn(MutationObserver.prototype, 'observe');
      mockGetGlobalScope.mockReturnValue(window); // Ensure global scope is present

      withoutBody(() => {
        const subscription = createMutationObservable().subscribe(() => {
          return;
        });
        subscription.unsubscribe();
      });

      expect(observeSpy).toHaveBeenCalledWith(document.documentElement, expect.objectContaining({ subtree: true }));
    });

    test('should handle a document with neither body nor document element safely', () => {
      const observeSpy = jest.spyOn(MutationObserver.prototype, 'observe');
      const originalDocumentElement = document.documentElement;
      Object.defineProperty(document, 'documentElement', { value: null, configurable: true });

      try {
        withoutBody(() => {
          const subscription = createMutationObservable().subscribe(() => {
            return;
          });
          subscription.unsubscribe();
        });
      } finally {
        Object.defineProperty(document, 'documentElement', {
          value: originalDocumentElement,
          configurable: true,
        });
      }

      expect(observeSpy).not.toHaveBeenCalled();
    });
  });
});
