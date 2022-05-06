import {
  AmplitudeCore,
  buildResponse,
  Destination,
  Config,
  Logger,
  AMPLITUDE_PREFIX,
  returnWrapper,
} from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    const client = new AmplitudeCore();
    expect(typeof client.init).toBe('function');
    expect(typeof client.track).toBe('function');
    expect(typeof client.logEvent).toBe('function');
    expect(typeof client.identify).toBe('function');
    expect(typeof client.groupIdentify).toBe('function');
    expect(typeof client.setGroup).toBe('function');
    expect(typeof client.setOptOut).toBe('function');
    expect(typeof client.revenue).toBe('function');
    expect(typeof client.add).toBe('function');
    expect(typeof client.remove).toBe('function');
    expect(typeof buildResponse).toBe('function');
    expect(typeof Destination).toBe('function');
    expect(typeof Config).toBe('function');
    expect(typeof Logger).toBe('function');
    expect(typeof returnWrapper).toBe('function');
    expect(AMPLITUDE_PREFIX).toBe('AMP');
  });
});
