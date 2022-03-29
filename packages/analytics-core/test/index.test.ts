import {
  init,
  track,
  logEvent,
  identify,
  groupIdentify,
  setGroup,
  setOptOut,
  revenue,
  add,
  remove,
  getConfig,
  buildResponse,
  Destination,
  Config,
  Logger,
  AMPLITUDE_PREFIX,
} from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    expect(typeof init).toBe('function');
    expect(typeof track).toBe('function');
    expect(typeof logEvent).toBe('function');
    expect(typeof identify).toBe('function');
    expect(typeof groupIdentify).toBe('function');
    expect(typeof setGroup).toBe('function');
    expect(typeof setOptOut).toBe('function');
    expect(typeof revenue).toBe('function');
    expect(typeof add).toBe('function');
    expect(typeof remove).toBe('function');
    expect(typeof getConfig).toBe('function');
    expect(typeof buildResponse).toBe('function');
    expect(typeof Destination).toBe('function');
    expect(typeof Config).toBe('function');
    expect(typeof Logger).toBe('function');
    expect(AMPLITUDE_PREFIX).toBe('AMP');
  });
});
