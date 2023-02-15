/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  AmplitudeCore,
  BaseTransport,
  Destination,
  Config,
  Logger,
  AMPLITUDE_PREFIX,
  returnWrapper,
  debugWrapper,
  getClientLogConfig,
  getClientStates,
  UUID,
  MemoryStorage,
  createIdentifyEvent,
} from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    const client = new AmplitudeCore();
    expect(typeof (client as any)._init).toBe('function');
    expect(typeof client.track).toBe('function');
    expect(typeof client.logEvent).toBe('function');
    expect(typeof client.identify).toBe('function');
    expect(typeof client.groupIdentify).toBe('function');
    expect(typeof client.setGroup).toBe('function');
    expect(typeof client.setOptOut).toBe('function');
    expect(typeof client.revenue).toBe('function');
    expect(typeof client.add).toBe('function');
    expect(typeof client.remove).toBe('function');
    expect(typeof BaseTransport).toBe('function');
    expect(typeof Destination).toBe('function');
    expect(typeof Config).toBe('function');
    expect(typeof Logger).toBe('function');
    expect(typeof returnWrapper).toBe('function');
    expect(typeof debugWrapper).toBe('function');
    expect(typeof getClientLogConfig).toBe('function');
    expect(typeof getClientStates).toBe('function');
    expect(typeof UUID).toBe('function');
    expect(typeof MemoryStorage).toBe('function');
    expect(typeof createIdentifyEvent).toBe('function');
    expect(AMPLITUDE_PREFIX).toBe('AMP');
  });
});
