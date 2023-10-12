/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  AmplitudeCore,
  BaseTransport,
  Destination,
  Config,
  Logger,
  AMPLITUDE_PREFIX,
  STORAGE_PREFIX,
  returnWrapper,
  debugWrapper,
  getClientLogConfig,
  getClientStates,
  UUID,
  MemoryStorage,
  createIdentifyEvent,
  BaseDiagnostic,
  buildResult,
  DIAGNOSTIC_MESSAGES,
  DIAGNOSTIC_METADATA_TYPE,
  DIAGNOSTIC_ENDPOINT,
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
    expect(typeof BaseDiagnostic).toBe('function');
    expect(typeof Config).toBe('function');
    expect(typeof Logger).toBe('function');
    expect(typeof returnWrapper).toBe('function');
    expect(typeof debugWrapper).toBe('function');
    expect(typeof getClientLogConfig).toBe('function');
    expect(typeof getClientStates).toBe('function');
    expect(typeof UUID).toBe('function');
    expect(typeof MemoryStorage).toBe('function');
    expect(typeof createIdentifyEvent).toBe('function');
    expect(typeof buildResult).toBe('function');
    expect(AMPLITUDE_PREFIX).toBe('AMP');
    expect(STORAGE_PREFIX).toBe('AMP_unsent');
    expect(DIAGNOSTIC_MESSAGES.EXCEEDED_MAX_RETRY).toBe('exceeded max retries');
    expect(DIAGNOSTIC_MESSAGES.MISSING_API_KEY).toBe('missing API key');
    expect(DIAGNOSTIC_MESSAGES.UNEXPECTED_ERROR).toBe('unexpected error');
    expect(DIAGNOSTIC_MESSAGES.INVALID_OR_MISSING_FIELDS).toBe('invalid or missing fields');
    expect(DIAGNOSTIC_MESSAGES.EVENT_ERROR).toBe('event error');
    expect(DIAGNOSTIC_MESSAGES.PAYLOAD_TOO_LARGE).toBe('payload too large');
    expect(DIAGNOSTIC_MESSAGES.EXCEEDED_DAILY_QUOTA).toBe('exceeded daily quota users or devices');
    expect(DIAGNOSTIC_METADATA_TYPE).toBe('SDK_DIAGNOSTIC');
    expect(DIAGNOSTIC_ENDPOINT).toBe('https://api-omni.stag2.amplitude.com/omni/metrics');
  });
});
