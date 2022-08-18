import {
  add,
  createInstance,
  groupIdentify,
  Identify,
  identify,
  init,
  logEvent,
  remove,
  Revenue,
  revenue,
  setGroup,
  setOptOut,
  track,
  flush,
} from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    expect(typeof add).toBe('function');
    expect(typeof createInstance).toBe('function');
    expect(typeof groupIdentify).toBe('function');
    expect(typeof Identify).toBe('function');
    expect(typeof identify).toBe('function');
    expect(typeof init).toBe('function');
    expect(typeof logEvent).toBe('function');
    expect(typeof remove).toBe('function');
    expect(typeof Revenue).toBe('function');
    expect(typeof revenue).toBe('function');
    expect(typeof setGroup).toBe('function');
    expect(typeof setOptOut).toBe('function');
    expect(typeof track).toBe('function');
    expect(typeof flush).toBe('function');
  });
});
