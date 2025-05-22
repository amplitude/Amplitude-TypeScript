/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectMaxScrolls"] }] */
import * as AnalyticsCore from '@amplitude/analytics-core';
import { BeaconTransport } from '../../src/beacon-transport';
import { ScrollEventPayload, ScrollWatcher } from '../../src/hooks/scroll';
import { utils } from '@amplitude/rrweb';
import { randomUUID } from 'crypto';
import { ILogger } from '@amplitude/analytics-core';

jest.mock('@amplitude/rrweb');
jest.mock('../../src/beacon-transport');

describe('scroll', () => {
  const mockGlobalScope = (globalScope?: Partial<typeof globalThis>) => {
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(globalScope as typeof globalThis);
  };

  const mockWindowScroll = (left = 0, top = 0) => {
    (utils.getWindowScroll as jest.Mock).mockImplementation(() => {
      return { left, top };
    }) as any;
  };

  const mockWindowWidth = (width = 0) => {
    (utils.getWindowWidth as jest.Mock).mockImplementation(() => {
      return width;
    }) as any;
  };

  const mockWindowHeight = (height = 0) => {
    (utils.getWindowHeight as jest.Mock).mockImplementation(() => {
      return height;
    }) as any;
  };

  describe('ScrollWatcher', () => {
    const mockTransport = BeaconTransport<ScrollEventPayload> as jest.MockedClass<
      typeof BeaconTransport<ScrollEventPayload>
    >;

    let mockTransportInstance: BeaconTransport<ScrollEventPayload>;
    let scrollWatcher: ScrollWatcher;

    beforeEach(() => {
      mockWindowScroll();
      mockWindowWidth();
      mockWindowHeight();
      mockGlobalScope({
        location: {
          href: 'http://localhost',
        } as any,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mockTransportInstance = new mockTransport({} as any, {} as any);
      const mockLoggerProvider: ILogger = {
        error: jest.fn(),
        log: jest.fn(),
        disable: jest.fn(),
        enable: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      };
      scrollWatcher = new ScrollWatcher(mockTransportInstance, {
        loggerProvider: mockLoggerProvider,
        interactionConfig: {
          enabled: true,
          ugcFilterRules: [],
          batch: false,
        },
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      jest.resetAllMocks();
    });

    const expectMaxScrolls = (scrolls: {
      maxScrollX?: number;
      maxScrollY?: number;
      maxScrollWidth?: number;
      maxScrollHeight?: number;
    }) => {
      expect({
        maxScrollX: scrolls.maxScrollX && scrollWatcher.maxScrollX,
        maxScrollY: scrolls.maxScrollY && scrollWatcher.maxScrollY,
        maxScrollWidth: scrolls.maxScrollWidth && scrollWatcher.maxScrollWidth,
        maxScrollHeight: scrolls.maxScrollHeight && scrollWatcher.maxScrollHeight,
      }).toStrictEqual({
        maxScrollX: scrolls.maxScrollX,
        maxScrollY: scrolls.maxScrollY,
        maxScrollWidth: scrolls.maxScrollWidth,
        maxScrollHeight: scrolls.maxScrollHeight,
      });
    };

    describe('#send', () => {
      test('sends scroll event', () => {
        scrollWatcher.hook({ id: 1, x: 3, y: 5 });
        const deviceId = randomUUID().toString();
        scrollWatcher.send(() => deviceId)({} as Event);

        expect(mockTransport.prototype.send.mock.calls[0][0]).toStrictEqual(deviceId);
        expect(mockTransport.prototype.send.mock.calls[0][1]).toStrictEqual({
          version: 1,
          events: [
            {
              maxScrollX: 3,
              maxScrollY: 5,
              maxScrollWidth: 3,
              maxScrollHeight: 5,

              viewportHeight: 0,
              viewportWidth: 0,
              pageUrl: 'http://localhost',
              timestamp: expect.any(Number),
              type: 'scroll',
            },
          ],
        });
      });

      test('applies UGC filter rules to page URL', () => {
        mockGlobalScope({
          location: {
            href: 'http://localhost?user=123&token=abc',
          } as any,
        });

        const mockLoggerProvider: ILogger = {
          error: jest.fn(),
          log: jest.fn(),
          disable: jest.fn(),
          enable: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        };

        const scrollWatcherWithUgcRules = new ScrollWatcher(mockTransportInstance, {
          loggerProvider: mockLoggerProvider,
          interactionConfig: {
            enabled: true,
            ugcFilterRules: [
              {
                selector: 'http://localhost?user=123&token=*',
                replacement: 'http://localhost?user=123&token=REDACTED',
              },
            ],
            batch: false,
          },
        });

        scrollWatcherWithUgcRules.hook({ id: 1, x: 3, y: 5 });
        const deviceId = randomUUID().toString();
        scrollWatcherWithUgcRules.send(() => deviceId)({} as Event);

        expect(mockTransport.prototype.send.mock.calls[0][0]).toStrictEqual(deviceId);
        const payload = mockTransport.prototype.send.mock.calls[0][1] as ScrollEventPayload;
        expect(payload.events[0].pageUrl).toBe('http://localhost?user=123&token=REDACTED');
      });

      test('handles undefined interactionConfig', () => {
        mockGlobalScope({
          location: {
            href: 'http://localhost?user=123&token=abc',
          } as any,
        });

        const mockLoggerProvider: ILogger = {
          error: jest.fn(),
          log: jest.fn(),
          disable: jest.fn(),
          enable: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        };

        const scrollWatcherWithoutConfig = new ScrollWatcher(mockTransportInstance, {
          loggerProvider: mockLoggerProvider,
        });

        scrollWatcherWithoutConfig.hook({ id: 1, x: 3, y: 5 });
        const deviceId = randomUUID().toString();
        scrollWatcherWithoutConfig.send(() => deviceId)({} as Event);

        expect(mockTransport.prototype.send.mock.calls[0][0]).toStrictEqual(deviceId);
        const payload = mockTransport.prototype.send.mock.calls[0][1] as ScrollEventPayload;
        expect(payload.events[0].pageUrl).toBe('http://localhost?user=123&token=abc');
      });

      test('handles empty ugcFilterRules array', () => {
        mockGlobalScope({
          location: {
            href: 'http://localhost?user=123&token=abc',
          } as any,
        });

        const mockLoggerProvider: ILogger = {
          error: jest.fn(),
          log: jest.fn(),
          disable: jest.fn(),
          enable: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        };

        const scrollWatcherWithEmptyRules = new ScrollWatcher(mockTransportInstance, {
          loggerProvider: mockLoggerProvider,
          interactionConfig: {
            enabled: true,
            ugcFilterRules: [],
            batch: false,
          },
        });

        scrollWatcherWithEmptyRules.hook({ id: 1, x: 3, y: 5 });
        const deviceId = randomUUID().toString();
        scrollWatcherWithEmptyRules.send(() => deviceId)({} as Event);

        expect(mockTransport.prototype.send.mock.calls[0][0]).toStrictEqual(deviceId);
        const payload = mockTransport.prototype.send.mock.calls[0][1] as ScrollEventPayload;
        expect(payload.events[0].pageUrl).toBe('http://localhost?user=123&token=abc');
      });
    });

    describe('#hook', () => {
      // Most of the tests are covered in #update
      test('updates correctly', () => {
        scrollWatcher.hook({ id: 1, x: 3, y: 5 });
        expectMaxScrolls({ maxScrollX: 3, maxScrollY: 5, maxScrollHeight: 5, maxScrollWidth: 3 });
      });
    });

    describe('#update', () => {
      const mockLoggerProvider: ILogger = {
        error: jest.fn(),
        log: jest.fn(),
        disable: jest.fn(),
        enable: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      };
      test('initial update', () => {
        scrollWatcher.update({ id: 1, x: 3, y: 4 });
        expectMaxScrolls({ maxScrollX: 3, maxScrollY: 4, maxScrollHeight: 4, maxScrollWidth: 3 });
      });

      test('new max scroll x', () => {
        scrollWatcher.update({ id: 1, x: 3, y: 4 });
        scrollWatcher.update({ id: 1, x: 5, y: 4 });
        expectMaxScrolls({ maxScrollX: 5, maxScrollWidth: 5 });
      });

      test('does not update max scroll x', () => {
        scrollWatcher.update({ id: 1, x: 3, y: 4 });
        scrollWatcher.update({ id: 1, x: 2, y: 4 });
        expectMaxScrolls({ maxScrollX: 3, maxScrollWidth: 3 });
      });

      test('new max scroll y', () => {
        scrollWatcher.update({ id: 1, x: 3, y: 4 });
        scrollWatcher.update({ id: 1, x: 3, y: 6 });
        expectMaxScrolls({ maxScrollY: 6, maxScrollHeight: 6 });
      });

      test('does not update max scroll y', () => {
        scrollWatcher.update({ id: 1, x: 3, y: 4 });
        scrollWatcher.update({ id: 1, x: 2, y: 1 });
        expectMaxScrolls({ maxScrollY: 4, maxScrollHeight: 4 });
      });

      test('new max scroll width', () => {
        mockWindowWidth(42);
        scrollWatcher = new ScrollWatcher(mockTransportInstance, {
          loggerProvider: mockLoggerProvider,
          interactionConfig: {
            enabled: true,
            ugcFilterRules: [],
            batch: false,
          },
        });
        scrollWatcher.update({ id: 1, x: 3, y: 4 });
        scrollWatcher.update({ id: 1, x: 5, y: 4 });
        expectMaxScrolls({ maxScrollX: 5, maxScrollWidth: 42 + 5 });
      });

      test('new max scroll height', () => {
        mockWindowHeight(24);
        scrollWatcher = new ScrollWatcher(mockTransportInstance, {
          loggerProvider: mockLoggerProvider,
          interactionConfig: {
            enabled: true,
            ugcFilterRules: [],
            batch: false,
          },
        });
        scrollWatcher.update({ id: 1, x: 3, y: 4 });
        scrollWatcher.update({ id: 1, x: 5, y: 6 });
        expectMaxScrolls({ maxScrollY: 6, maxScrollHeight: 24 + 6 });
      });
    });
  });
});
