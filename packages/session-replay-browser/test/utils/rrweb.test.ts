import { getWindowHeight, getWindowWidth } from '../../src/utils/rrweb';
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

  describe('getWindowHeight', () => {
    test('should return globalScope.innerHeight when available', () => {
      mockGetGlobalScope.mockReturnValue({ innerHeight: 800 } as typeof globalThis);

      expect(getWindowHeight()).toBe(800);
    });

    test('should return document.documentElement.clientHeight when globalScope is null', () => {
      mockGetGlobalScope.mockReturnValue(undefined);
      Object.defineProperty(document, 'documentElement', {
        value: { clientHeight: 600 },
        writable: true,
      });

      expect(getWindowHeight()).toBe(600);
    });

    test('should return document.documentElement.clientHeight when globalScope.innerHeight not available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: { clientHeight: 600 },
        writable: true,
      });

      expect(getWindowHeight()).toBe(600);
    });

    test('should return document.body.clientHeight when documentElement.clientHeight not available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: null,
        writable: true,
      });
      Object.defineProperty(document, 'body', {
        value: { clientHeight: 400 },
        writable: true,
      });

      expect(getWindowHeight()).toBe(400);
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

      expect(getWindowHeight()).toBe(0);
    });
  });

  describe('getWindowWidth', () => {
    test('should return globalScope.innerWidth when available', () => {
      mockGetGlobalScope.mockReturnValue({ innerWidth: 1200 } as typeof globalThis);

      expect(getWindowWidth()).toBe(1200);
    });

    test('should return document.documentElement.clientWidth when globalScope is null', () => {
      mockGetGlobalScope.mockReturnValue(undefined);
      Object.defineProperty(document, 'documentElement', {
        value: { clientWidth: 1000 },
        writable: true,
      });

      expect(getWindowWidth()).toBe(1000);
    });

    test('should return document.documentElement.clientWidth when globalScope.innerWidth not available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: { clientWidth: 1000 },
        writable: true,
      });

      expect(getWindowWidth()).toBe(1000);
    });

    test('should return document.body.clientWidth when documentElement.clientWidth not available', () => {
      mockGetGlobalScope.mockReturnValue({} as typeof globalThis);
      Object.defineProperty(document, 'documentElement', {
        value: null,
        writable: true,
      });
      Object.defineProperty(document, 'body', {
        value: { clientWidth: 800 },
        writable: true,
      });

      expect(getWindowWidth()).toBe(800);
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

      expect(getWindowWidth()).toBe(0);
    });
  });
});
