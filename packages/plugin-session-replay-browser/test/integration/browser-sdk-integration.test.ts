/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as amplitude from '@amplitude/analytics-browser';
import { sessionReplayPlugin } from '../../src/session-replay';
import { Event } from '@amplitude/analytics-types';
import { server } from './mockAPIHandlers';
import { matchRequestUrl } from 'msw';

const apiKey = 'static_key';

function waitForEventRequest(method: string, url: string, eventType: string) {
  return new Promise<Request>((resolve) => {
    server.events.on('request:start', ({ request }) => {
      const matchesMethod = request.method.toLowerCase() === method.toLowerCase();
      const matchesUrl = matchRequestUrl(new URL(request.url), url).matches;
      request
        .clone()
        .json()
        .then((body) => {
          console.log('body', body, body.events[0].event_properties);
          const matchesAnyEvent = (body.events as Event[]).some((event) => event.event_type === eventType);

          if (matchesMethod && matchesUrl && matchesAnyEvent) {
            resolve(request);
          }
        })
        .catch(() => {
          // do nothing
        });
    });
  });
}

const setupPluginAndInit = async (args?: { browserSDKOptions?: amplitude.Types.BrowserOptions }) => {
  const sr = sessionReplayPlugin({
    sampleRate: 1,
    debugMode: true,
  });
  await amplitude.add(sr).promise;
  await amplitude.init(apiKey, undefined, {
    flushMaxRetries: 1,
    logLevel: 2,
    ...args?.browserSDKOptions,
  }).promise;
};

describe('SessionReplayPlugin Integration with Browser SDK', () => {
  beforeAll(() => server.listen());
  beforeEach(() => {
    server.resetHandlers();
  });
  afterEach(() => {
    jest.resetAllMocks();
  });
  afterAll(() => {
    server.close();
  });
  /**
   * NOTE: These tests must be run together in succession to pass successfully,
   * due to not being able to accurately reset the BrowserSDK to a pre-init state.
   * Using .only on these tests will result in individual test failures
   */
  describe('tagging events', () => {
    const pendingSessionStartRequest = waitForEventRequest(
      'POST',
      'https://api2.amplitude.com/2/httpapi',
      'session_start',
    );
    beforeAll(async () => {
      await setupPluginAndInit({
        browserSDKOptions: {
          defaultTracking: {
            sessions: true,
            pageViews: false,
          },
        },
      });
    });
    test('should tag initial start session event with session replay id', async () => {
      const request = await pendingSessionStartRequest;
      const startSessionEventBody = await request.json();
      const startSessionEvent = (startSessionEventBody.events as Event[]).find(
        (event) => event.event_type === 'session_start',
      );
      const deviceId = startSessionEvent?.device_id as string;
      const sessionId = startSessionEvent?.session_id as number;
      expect(startSessionEvent).toEqual(
        expect.objectContaining({
          event_properties: {
            '[Amplitude] Session Replay Debug': JSON.stringify({ appHash: '-109988594' }),
            '[Amplitude] Session Replay ID': `${deviceId}/${sessionId}`,
          },
        }),
      );
    });
    test('should tag updated start session event with session replay id', async () => {
      const pendingUpdatedSessionStartRequest = waitForEventRequest(
        'POST',
        'https://api2.amplitude.com/2/httpapi',
        'session_start',
      );
      const newSessionId = 456;
      amplitude.setSessionId(newSessionId);
      const request = await pendingUpdatedSessionStartRequest;

      const startSessionEventBody = await request.json();
      const startSessionEvent = (startSessionEventBody.events as Event[]).find(
        (event) => event.event_type === 'session_start',
      );
      const deviceId = startSessionEvent?.device_id as string;
      expect(startSessionEvent).toEqual(
        expect.objectContaining({
          event_properties: {
            '[Amplitude] Session Replay Debug': JSON.stringify({ appHash: '-109988594' }),
            '[Amplitude] Session Replay ID': `${deviceId}/${newSessionId}`,
          },
        }),
      );
    });
    test('should tag an event with session replay id', async () => {
      const eventType = 'My Event';
      const pendingPageViewRequest = waitForEventRequest('POST', 'https://api2.amplitude.com/2/httpapi', eventType);
      amplitude.track(eventType);

      const request = await pendingPageViewRequest;
      const pageViewEventBody = await request.json();
      const pageViewEvent = (pageViewEventBody.events as Event[]).find((event) => event.event_type === eventType);
      const deviceId = pageViewEvent?.device_id as string;
      const sessionId = pageViewEvent?.session_id as number;
      expect(pageViewEvent).toEqual(
        expect.objectContaining({
          event_properties: {
            '[Amplitude] Session Replay Debug': JSON.stringify({ appHash: '-109988594' }),
            '[Amplitude] Session Replay ID': `${deviceId}/${sessionId}`,
          },
        }),
      );
    });
  });

  // describe.skip('without existing session', () => {
  //   test('should record events', () => {});
  // });
  // describe.skip('with existing session', () => {
  //   test('should record events', () => {});
  // });
});
