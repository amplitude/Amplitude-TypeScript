import * as AnalyticsCore from '@amplitude/analytics-core';
import { SessionReplayJoinedConfig } from 'src/config/types';
import { BeaconTransport } from '../../src/beacon-transport';
import { randomUUID } from 'crypto';

type TestEvent = {
  Field1: string;
  Field2: number;
};

describe('beacon', () => {
  const mockGlobalScope = (globalScope?: Partial<typeof globalThis>): typeof globalThis => {
    const mockedGlobalScope = jest.spyOn(AnalyticsCore, 'getGlobalScope');
    mockedGlobalScope.mockReturnValue(globalScope as typeof globalThis);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return AnalyticsCore.getGlobalScope()!;
  };

  describe('BeaconTransport', () => {
    let transport: BeaconTransport<TestEvent>;
    let deviceId: string;
    let sessionId: number;
    let apiKey: string;

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
      apiKey = randomUUID();

      transport = new BeaconTransport<TestEvent>(
        {
          sessionId,
          type: 'interaction',
        },
        {
          apiKey,
        } as SessionReplayJoinedConfig,
      );
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    describe('#send', () => {
      test('sends with beacon', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const mockedGlobalScope = mockGlobalScope({
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
          {
            apiKey,
          } as SessionReplayJoinedConfig,
        );
        transport.send(deviceId, {
          Field1: 'foo',
          Field2: 1234,
        });
        expect(xmlMockFns.open).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockedGlobalScope.navigator.sendBeacon).toHaveBeenCalledWith(
          `https://api-sr.amplitude.com/sessions/v2/track?device_id=${deviceId}&session_id=${sessionId}&type=interaction&api_key=${apiKey}`,
          JSON.stringify({ Field1: 'foo', Field2: 1234 }),
        );
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
          {
            apiKey,
          } as SessionReplayJoinedConfig,
        );
        transport.send(deviceId, {
          Field1: 'foo',
          Field2: 1234,
        });
        expect(xmlMockFns.open).toHaveBeenCalledWith(
          'POST',
          `https://api-sr.amplitude.com/sessions/v2/track?device_id=${deviceId}&session_id=${sessionId}&type=interaction&api_key=${apiKey}`,
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
          `https://api-sr.amplitude.com/sessions/v2/track?device_id=${deviceId}&session_id=${sessionId}&type=interaction&api_key=${apiKey}`,
          true,
        );
      });

      describe('with custom transport (handleSendEvents)', () => {
        const mockLogger = { warn: jest.fn() } as any;

        test('routes the beacon through handleSendEvents with auth header (api_key NOT in URL) and keepalive', () => {
          const sendBeacon = jest.fn().mockReturnValue(true);
          mockGlobalScope({ navigator: { sendBeacon }, Blob: jest.fn() } as any);
          const handleSendEvents = jest.fn().mockResolvedValue({ status: 200 });

          transport = new BeaconTransport<TestEvent>({ sessionId, type: 'interaction' }, {
            apiKey,
            handleSendEvents,
            loggerProvider: mockLogger,
          } as unknown as SessionReplayJoinedConfig);
          transport.send(deviceId, { Field1: 'foo', Field2: 1234 });

          expect(sendBeacon).not.toHaveBeenCalled();
          expect(xmlMockFns.open).not.toHaveBeenCalled();
          expect(handleSendEvents).toHaveBeenCalledTimes(1);
          const req = handleSendEvents.mock.calls[0][0];
          expect(req.method).toBe('POST');
          expect(req.keepalive).toBe(true);
          expect(req.url).toContain(`device_id=${deviceId}`);
          expect(req.url).toContain('type=interaction');
          expect(req.url).not.toContain('api_key=');
          expect(req.headers.Authorization).toBe(`Bearer ${apiKey}`);
          expect(req.body).toBe(JSON.stringify({ Field1: 'foo', Field2: 1234 }));
        });

        test('warns (does not throw) when the custom transport rejects', async () => {
          const handleSendEvents = jest.fn().mockRejectedValue(new Error('proxy down'));
          transport = new BeaconTransport<TestEvent>({ sessionId, type: 'interaction' }, {
            apiKey,
            handleSendEvents,
            loggerProvider: mockLogger,
          } as unknown as SessionReplayJoinedConfig);

          expect(() => transport.send(deviceId, { Field1: 'foo', Field2: 1234 })).not.toThrow();
          await Promise.resolve();
          expect(mockLogger.warn).toHaveBeenCalledWith(
            'Custom transport failed to send session replay interaction beacon:',
            expect.any(Error),
          );
        });

        test('warns (does not throw) when the custom transport throws synchronously', () => {
          const handleSendEvents = jest.fn(() => {
            throw new Error('sync boom');
          });
          transport = new BeaconTransport<TestEvent>({ sessionId, type: 'interaction' }, {
            apiKey,
            handleSendEvents,
            loggerProvider: mockLogger,
          } as unknown as SessionReplayJoinedConfig);

          expect(() => transport.send(deviceId, { Field1: 'foo', Field2: 1234 })).not.toThrow();
          expect(mockLogger.warn).toHaveBeenCalledWith(
            'Custom transport threw while sending session replay interaction beacon:',
            expect.any(Error),
          );
        });

        test('does not throw on async rejection when no loggerProvider is configured', async () => {
          const handleSendEvents = jest.fn().mockRejectedValue(new Error('proxy down'));
          transport = new BeaconTransport<TestEvent>({ sessionId, type: 'interaction' }, {
            apiKey,
            handleSendEvents,
          } as unknown as SessionReplayJoinedConfig);

          expect(() => transport.send(deviceId, { Field1: 'foo', Field2: 1234 })).not.toThrow();
          await Promise.resolve();
        });

        test('does not throw on synchronous error when no loggerProvider is configured', () => {
          const handleSendEvents = jest.fn(() => {
            throw new Error('sync boom');
          });
          transport = new BeaconTransport<TestEvent>({ sessionId, type: 'interaction' }, {
            apiKey,
            handleSendEvents,
          } as unknown as SessionReplayJoinedConfig);

          expect(() => transport.send(deviceId, { Field1: 'foo', Field2: 1234 })).not.toThrow();
        });
      });
    });
  });
});
