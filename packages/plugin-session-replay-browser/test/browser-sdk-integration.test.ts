/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as amplitude from '@amplitude/analytics-browser';
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { sessionReplayPlugin } from '../src/session-replay';

const apiKey = 'static_key';

const remoteConfigReturn = {
  status: 200,
  json: () => {
    return {
      configs: {
        sessionReplay: {
          sr_sampling_config: {
            sample_rate: 0.4,
            capture_enabled: true,
          },
        },
      },
    };
  },
};
const trackEventReturn = {
  status: 200,
  json: () => {
    return { code: 200, events_ingested: 4, payload_size_bytes: 2504, server_upload_time: 1714522639863 };
  },
};

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
    logLevel: 2,
  }).promise;
  amplitude.track('hello');
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
  let trackReturnResolve: (value: unknown) => void;
  const trackPromise = new Promise((resolve) => (trackReturnResolve = resolve));
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    originalFetch = global.fetch;
    global.fetch = jest.fn((url: string) => {
      console.log('url', url);
      if (url.includes('/config')) {
        console.log('config returned');
        return remoteConfigReturn;
      }

      return trackReturnResolve(trackEventReturn);
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

        // amplitude.setSessionId(Date.now());

        // eslint-disable-next-line @typescript-eslint/unbound-method
        await new Promise(process.nextTick);
        jest.runOnlyPendingTimers();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        await new Promise(process.nextTick);
        jest.runOnlyPendingTimers();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        await new Promise(process.nextTick);
        jest.runOnlyPendingTimers();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        await new Promise(process.nextTick);
        jest.runOnlyPendingTimers();
        return trackPromise.then(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
          const fetchBody = (fetch as jest.Mock).mock.calls;
          console.log('fetchBody', fetchBody);
          // const fetchBodyParsed = JSON.parse(fetchBody);
          // const sessionStart = fetchBodyParsed.events.find((event: any) => event.event_type === 'session_start');

          // expect(sessionStart.event_properties).toEqual({
          //   '[Amplitude] Session Replay ID': expect.anything(),
          // });
        });
      });
    });

    // describe('pageview event', () => {});

    // describe('custom event', () => {});
  });

  describe('without existing session', () => {
    test('should record events', () => {});
  });
  describe('with existing session', () => {
    test('should record events', () => {});
  });
});
