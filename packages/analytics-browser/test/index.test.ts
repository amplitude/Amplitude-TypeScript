/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as amplitude from '../src/index';
import { FakeBrowserClient } from './utils/fake-browser-client';

const {
  add,
  createInstance,
  extendSession,
  flush,
  getDeviceId,
  getSessionId,
  getUserId,
  groupIdentify,
  Identify,
  identify,
  init,
  logEvent,
  remove,
  reset,
  Revenue,
  revenue,
  runQueuedFunctions,
  setDeviceId,
  setGroup,
  setOptOut,
  setSessionId,
  setTransport,
  setUserId,
  track,
  AmplitudeBrowser,
} = amplitude;

describe('index', () => {
  test(`structural typing test, 'default export' should be  BrowserClient`, () => {
    for (const key of Object.keys(FakeBrowserClient.prototype)) {
      // add message for if it fails
      if (!(amplitude as any)[key]) {
        throw new Error(
          `'${key}' is a required method in BrowserClient but is not defined in analytics-browser export`,
        );
      }
    }
    // sanity test a few known methods
    expect(typeof amplitude.add).toBe('function');
    expect(typeof amplitude.getIdentity).toBe('function');
    expect(typeof amplitude.track).toBe('function');
    expect(typeof (amplitude as any).foo).toBe('undefined');
  });

  test('should expose apis', () => {
    expect(typeof add).toBe('function');
    expect(typeof createInstance).toBe('function');
    expect(typeof extendSession).toBe('function');
    expect(typeof flush).toBe('function');
    expect(typeof groupIdentify).toBe('function');
    expect(typeof getDeviceId).toBe('function');
    expect(typeof getSessionId).toBe('function');
    expect(typeof getUserId).toBe('function');
    expect(typeof Identify).toBe('function');
    expect(typeof identify).toBe('function');
    expect(typeof init).toBe('function');
    expect(typeof logEvent).toBe('function');
    expect(typeof remove).toBe('function');
    expect(typeof Revenue).toBe('function');
    expect(typeof revenue).toBe('function');
    expect(typeof reset).toBe('function');
    expect(typeof runQueuedFunctions).toBe('function');
    expect(typeof setDeviceId).toBe('function');
    expect(typeof setGroup).toBe('function');
    expect(typeof setOptOut).toBe('function');
    expect(typeof setSessionId).toBe('function');
    expect(typeof setTransport).toBe('function');
    expect(typeof setUserId).toBe('function');
    expect(typeof track).toBe('function');
    expect(typeof AmplitudeBrowser).toBe('function');
  });
});
