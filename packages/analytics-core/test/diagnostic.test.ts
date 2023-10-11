import { DIAGNOSTIC_ENDPOINT } from '../src/constants';
import { Diagnostic } from '../src/diagnostics/diagnostic';

jest.useFakeTimers();

describe('Diagnostic', () => {
  let diagnostic: Diagnostic;
  const eventCount = 5;
  const code = 200;
  const delay = 60000;

  beforeEach(() => {
    diagnostic = new Diagnostic();
  });

  afterEach(() => {
    jest.restoreAllMocks(); // Restore mocked functions after each test
  });

  describe('constructor', () => {
    test('should set default values if not provided', () => {
      expect(diagnostic.serverUrl).toBe(DIAGNOSTIC_ENDPOINT);
      expect(diagnostic.isDisabled).toBe(false);
    });

    test('should set isDisabled to provided value', () => {
      const isDisabled = true;
      diagnostic = new Diagnostic({ isDisabled });
      expect(diagnostic.serverUrl).toBe(DIAGNOSTIC_ENDPOINT);
      expect(diagnostic.isDisabled).toBe(isDisabled);
    });

    test('should set serverUrl to provided value', () => {
      const serverUrl = 'https://test.com';
      diagnostic = new Diagnostic({ serverUrl });
      expect(diagnostic.serverUrl).toBe(serverUrl);
      expect(diagnostic.isDisabled).toBe(false);
    });
  });

  describe('track', () => {
    test('should add events to the queue when track method is called', () => {
      diagnostic.track(eventCount, code, 'Test message');

      expect(diagnostic.queue).toHaveLength(1);
      expect(diagnostic.queue[0].omni_metrics.event_count).toBe(eventCount);
      expect(diagnostic.queue[0].omni_metrics.response_code).toBe(code);
      expect(diagnostic.queue[0].omni_metrics.trigger).toBe('Test message');
      expect(diagnostic.queue[0].omni_metrics.library).toBe('amplitude-ts');
    });

    test('should not add to queen when disabled', () => {
      diagnostic.isDisabled = true;
      diagnostic.track(eventCount, code, 'Test message');

      expect(diagnostic.queue).toHaveLength(0);
    });

    test('should schedule flush when track is called for the first time', () => {
      const setTimeoutMock = jest.spyOn(global, 'setTimeout');

      diagnostic.track(eventCount, code, 'Test message');

      jest.advanceTimersByTime(delay);
      expect(setTimeoutMock).toHaveBeenCalledTimes(1);
      expect(setTimeoutMock.mock.calls[0][0]).toBeInstanceOf(Function);
      expect(setTimeoutMock.mock.calls[0][1]).toBe(delay);
      setTimeoutMock.mockRestore();
    });
  });

  describe('flush', () => {
    test('should clear scheduled timeout when flush is called', async () => {
      const clearTimeoutMock = jest.spyOn(global, 'clearTimeout');
      const setTimeoutMock = jest.spyOn(global, 'setTimeout');

      diagnostic.track(eventCount, code, 'Scheduled timeout test');
      await diagnostic.flush();

      expect(setTimeoutMock).toHaveBeenCalledTimes(1);
      expect(clearTimeoutMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestPayloadBuilder', () => {
    test('should return correct payload', () => {
      const events = [
        {
          api_key: 'test-api-key',
          omni_metrics: {
            metadata_type: 'diagnostic',
            library: 'diagnostic-test-library',
            accounting_time_min: Date.now(),
            response_code: code,
            trigger: 'test trigger',
            action: 'test action',
            event_count: eventCount,
          },
        },
      ];

      const expectedPayload = {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
        },
        events: events,
        method: 'POST',
      };

      expect(diagnostic.requestPayloadBuilder(events)).toEqual(expectedPayload);
    });
  });
});
