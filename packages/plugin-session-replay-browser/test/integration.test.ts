import * as amplitude from '@amplitude/analytics-browser';
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { sessionReplayPlugin } from '../src/session-replay';

const apiKey = 'static_key';

const fetchReturn = Promise.resolve({
  status: 200,
  json: () => {
    return { code: 200, events_ingested: 4, payload_size_bytes: 2504, server_upload_time: 1714522639863 };
  },
});

const setupPluginAndInit = async () => {
  const sr = sessionReplayPlugin({
    sampleRate: 1,
  });
  await amplitude.add(sr).promise;
  await amplitude.init(apiKey, undefined, {
    defaultTracking: {
      sessions: true,
      pageViews: true,
    },
    flushMaxRetries: 1,
    logLevel: 4,
  }).promise;
};

let originalFetch: typeof global.fetch;
const addEventListenerMock = jest.fn() as jest.Mock<typeof window.addEventListener>;
const removeEventListenerMock = jest.fn() as jest.Mock<typeof window.removeEventListener>;
const mockGlobalScope = {
  addEventListener: addEventListenerMock,
  removeEventListener: removeEventListenerMock,
  document: {
    hasFocus: () => true,
  },
} as unknown as typeof globalThis;

describe('SessionReplayPlugin Integration with Browser SDK', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    originalFetch = global.fetch;
    global.fetch = jest.fn((url) => {
      console.log('url', url);
      return fetchReturn;
    }) as jest.Mock;
    jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(mockGlobalScope);
  });
  afterEach(() => {
    jest.resetAllMocks();
    global.fetch = originalFetch;

    jest.useRealTimers();
  });
  describe('tagging events', () => {
    describe('start session event', () => {
      test('should tag start session event with session replay id', async () => {
        await setupPluginAndInit();

        amplitude.setSessionId(Date.now());

        // eslint-disable-next-line @typescript-eslint/unbound-method
        await new Promise(process.nextTick);
        jest.runOnlyPendingTimers();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        await new Promise(process.nextTick);
        jest.runOnlyPendingTimers();
        return fetchReturn.then(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
          const fetchBody = (fetch as jest.Mock).mock.calls[0][1].body;
          const fetchBodyParsed = JSON.parse(fetchBody);
          const sessionStart = fetchBodyParsed.events.find((event: any) => event.event_type === 'session_start');

          expect(sessionStart.event_properties).toEqual({
            '[Amplitude] Session Replay ID': expect.anything(),
          });
        });
      });
    });

    // describe('pageview event', () => {});

    // describe('custom event', () => {});
  });
});
