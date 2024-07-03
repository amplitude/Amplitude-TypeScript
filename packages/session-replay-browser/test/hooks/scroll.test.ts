/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectMaxScrolls"] }] */
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { BeaconTransport } from '../../src/hooks/beacon';
import { ScrollEvent, ScrollWatcher } from '../../src/hooks/scroll';
import { utils } from '@amplitude/rrweb';
import { randomUUID } from 'crypto';

jest.mock('@amplitude/rrweb');
jest.mock('../../src/hooks/beacon');

describe('scroll', () => {
  const mockGlobalScope = (globalScope?: Partial<typeof globalThis>) => {
    jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(globalScope as typeof globalThis);
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
    const mockTransport = BeaconTransport<ScrollEvent> as jest.MockedClass<typeof BeaconTransport<ScrollEvent>>;

    let mockTransportInstance: BeaconTransport<ScrollEvent>;
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
      scrollWatcher = new ScrollWatcher(mockTransportInstance);
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
          maxScrollX: 3,
          maxScrollY: 5,
          maxScrollWidth: 3,
          maxScrollHeight: 5,

          viewportHeight: 0,
          viewportWidth: 0,
          pageUrl: 'http://localhost/',
          timestamp: expect.any(Number),
          type: 'scroll',
        });
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
        scrollWatcher = new ScrollWatcher(mockTransportInstance);
        scrollWatcher.update({ id: 1, x: 3, y: 4 });
        scrollWatcher.update({ id: 1, x: 5, y: 4 });
        expectMaxScrolls({ maxScrollX: 5, maxScrollWidth: 42 + 5 });
      });

      test('new max scroll height', () => {
        mockWindowHeight(24);
        scrollWatcher = new ScrollWatcher(mockTransportInstance);
        scrollWatcher.update({ id: 1, x: 3, y: 4 });
        scrollWatcher.update({ id: 1, x: 5, y: 6 });
        expectMaxScrolls({ maxScrollY: 6, maxScrollHeight: 24 + 6 });
      });
    });
  });
});
