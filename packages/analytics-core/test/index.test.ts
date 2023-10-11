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
  Diagnostic,
  buildResult,
  EXCEEDED_MAX_RETRY_DIAGNOSTIC_MESSAGE,
  MISSING_API_KEY_DIAGNOSTIC_MESSAGE,
  UNEXPECTED_DIAGNOSTIC_MESSAGE,
  INVALID_OR_MISSING_FIELDS_DIAGNOSTIC_MESSAGE,
  EVENT_ERROR_DIAGNOSTIC_MESSAGE,
  PAYLOAD_TOO_LARGE_DIAGNOSTIC_MESSAGE,
  EXCEEDED_DAILY_QUOTA_DIAGNOSTIC_MESSAGE,
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
    expect(typeof Diagnostic).toBe('function');
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
    expect(EXCEEDED_MAX_RETRY_DIAGNOSTIC_MESSAGE).toBe('exceeded max retries');
    expect(MISSING_API_KEY_DIAGNOSTIC_MESSAGE).toBe('missing API key');
    expect(UNEXPECTED_DIAGNOSTIC_MESSAGE).toBe('unexpected error');
    expect(INVALID_OR_MISSING_FIELDS_DIAGNOSTIC_MESSAGE).toBe('invalid or missing fields');
    expect(EVENT_ERROR_DIAGNOSTIC_MESSAGE).toBe('event error');
    expect(PAYLOAD_TOO_LARGE_DIAGNOSTIC_MESSAGE).toBe('payload too large');
    expect(EXCEEDED_DAILY_QUOTA_DIAGNOSTIC_MESSAGE).toBe('exceeded daily quota users or devices');
  });
});
