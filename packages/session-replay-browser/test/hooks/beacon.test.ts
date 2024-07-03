import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { SessionReplayJoinedConfig } from 'src/config/types';
import { BeaconTransport } from '../../src/beacon-transport';
import { randomUUID } from 'crypto';

type TestEvent = {
  Field1: string;
  Field2: number;
};

jest.mock('@amplitude/analytics-client-common');

describe('beacon', () => {
  const mockGlobalScope = (globalScope?: Partial<typeof globalThis>) => {
    jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(globalScope as typeof globalThis);
  };

  describe('BeaconTransport', () => {
    let transport: BeaconTransport<TestEvent>;
    let deviceId: string;
    let sessionId: number;

    const xmlMockFns = {
      open: jest.fn(),
      send: jest.fn(),
      setRequestHeader: jest.fn(),
    };

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      window.XMLHttpRequest = jest.fn().mockImplementation(() => {
        return xmlMockFns;
      }) as any;

      sessionId = Date.now();
      deviceId = randomUUID();

      transport = new BeaconTransport<TestEvent>(
        {
          sessionId,
          type: 'interaction',
        },
        {} as SessionReplayJoinedConfig,
      );
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    describe('#send', () => {
      test('sends with beacon', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        mockGlobalScope({
          navigator: {
            sendBeacon: jest.fn().mockImplementation(() => true),
          },
          Blob: jest.fn(),
        } as any);

        transport = new BeaconTransport<TestEvent>(
          {
            sessionId,
            type: 'interaction',
          },
          {} as SessionReplayJoinedConfig,
        );
        transport.send(deviceId, {
          Field1: 'foo',
          Field2: 1234,
        });
        expect(xmlMockFns.open).not.toHaveBeenCalled();
      });
      test('falls back to xhr', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        mockGlobalScope({
          navigator: {
            sendBeacon: jest.fn().mockImplementation(() => false),
          },
          Blob: jest.fn(),
        } as any);

        transport = new BeaconTransport<TestEvent>(
          {
            sessionId,
            type: 'interaction',
          },
          {} as SessionReplayJoinedConfig,
        );
        transport.send(deviceId, {
          Field1: 'foo',
          Field2: 1234,
        });
        expect(xmlMockFns.open).toHaveBeenCalledWith(
          'POST',
          `https://api-sr.amplitude.com/sessions/v2/track?device_id=${deviceId}&session_id=${sessionId}&type=interaction`,
          true,
        );
      });
      test('sends with xhr', () => {
        transport.send(deviceId, {
          Field1: 'foo',
          Field2: 1234,
        });
        expect(xmlMockFns.open).toHaveBeenCalledWith(
          'POST',
          `https://api-sr.amplitude.com/sessions/v2/track?device_id=${deviceId}&session_id=${sessionId}&type=interaction`,
          true,
        );
      });
    });
  });
});
