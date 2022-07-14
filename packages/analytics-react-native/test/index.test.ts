import {
  add,
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
  Revenue,
  revenue,
  setDeviceId,
  setGroup,
  setOptOut,
  setSessionId,
  setTransport,
  setUserId,
  track,
} from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    expect(typeof add).toBe('function');
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
    expect(typeof setDeviceId).toBe('function');
    expect(typeof setGroup).toBe('function');
    expect(typeof setOptOut).toBe('function');
    expect(typeof setSessionId).toBe('function');
    expect(typeof setTransport).toBe('function');
    expect(typeof setUserId).toBe('function');
    expect(typeof track).toBe('function');
  });
});
