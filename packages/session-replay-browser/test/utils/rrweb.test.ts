import { getViewportHeight, getViewportWidth } from '../../src/utils/rrweb';
import { getGlobalScope } from '@amplitude/analytics-core';

// Mock the getGlobalScope function
jest.mock('@amplitude/analytics-core', () => ({
  getGlobalScope: jest.fn(),
}));

const mockGetGlobalScope = getGlobalScope as jest.MockedFunction<typeof getGlobalScope>;

describe('rrweb utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset document properties
    Object.defineProperty(document, 'documentElement', {
      writable: true,
      value: document.documentElement,
    });
    Object.defineProperty(document, 'body', {
      writable: true,
      value: document.body,
    });
  });

  describe('getViewportHeight', () => {
    test('should return globalScope.innerHeight when available', () => {
      mockGetGlobalScope.mockReturnValue({ innerHeight: 800 } as typeof globalThis);

      expect(getViewportHeight()).toBe(800);
    });

    test('should return document.documentElement.clientHeight when globalScope is null', () => {
      mockGetGlobalScope.mockReturnValue(undefined);
      Object.defineProperty(document, 'documentElement', {
        value: { clientHeight: 600 },
        writable: true,
      });

      expect(getViewportHeight()).toBe(600);
    });

    test('should return document.documentElement.clientHeight when globalScope.innerHeight not available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: { clientHeight: 600 },
        writable: true,
      });

      expect(getViewportHeight()).toBe(600);
    });

    test('should return 0 when documentElement.clientHeight is 0 (not fallback to body.clientHeight)', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: { clientHeight: 0 },
        writable: true,
      });
      Object.defineProperty(document, 'body', {
        value: { clientHeight: 14000 },
        writable: true,
      });

      expect(getViewportHeight()).toBe(0);
    });

    test('should return 0 when documentElement.clientHeight not available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: null,
        writable: true,
      });

      expect(getViewportHeight()).toBe(0);
    });

    test('should return 0 when no height sources are available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: null,
        writable: true,
      });
      Object.defineProperty(document, 'body', {
        value: null,
        writable: true,
      });

      expect(getViewportHeight()).toBe(0);
    });
  });

  describe('getViewportWidth', () => {
    test('should return globalScope.innerWidth when available', () => {
      mockGetGlobalScope.mockReturnValue({ innerWidth: 1200 } as typeof globalThis);

      expect(getViewportWidth()).toBe(1200);
    });

    test('should return document.documentElement.clientWidth when globalScope is null', () => {
      mockGetGlobalScope.mockReturnValue(undefined);
      Object.defineProperty(document, 'documentElement', {
        value: { clientWidth: 1000 },
        writable: true,
      });

      expect(getViewportWidth()).toBe(1000);
    });

    test('should return document.documentElement.clientWidth when globalScope.innerWidth not available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: { clientWidth: 1000 },
        writable: true,
      });

      expect(getViewportWidth()).toBe(1000);
    });

    test('should return 0 when documentElement.clientWidth is 0 (not fallback to body.clientWidth)', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: { clientWidth: 0 },
        writable: true,
      });
      Object.defineProperty(document, 'body', {
        value: { clientWidth: 10000 },
        writable: true,
      });

      expect(getViewportWidth()).toBe(0);
    });

    test('should return 0 when documentElement.clientWidth not available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: null,
        writable: true,
      });

      expect(getViewportWidth()).toBe(0);
    });

    test('should return 0 when no width sources are available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: null,
        writable: true,
      });
      Object.defineProperty(document, 'body', {
        value: null,
        writable: true,
      });

      expect(getViewportWidth()).toBe(0);
    });
  });
});
