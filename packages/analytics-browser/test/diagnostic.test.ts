import { DIAGNOSTIC_ENDPOINT, DIAGNOSTIC_METADATA_TYPE } from '@amplitude/analytics-core';
import { BrowserDiagnostic } from '../src/diagnostics/diagnostic';

describe('Diagnostic', () => {
  test('should fetch', async () => {
    const diagnostic = new BrowserDiagnostic();
    const fetchMock = jest.fn().mockResolvedValueOnce({} as Response);
    Date.now = jest.fn().mockReturnValue(1697583342266);
    global.fetch = fetchMock;

    diagnostic.track(5, 400, 'test message 0');
    diagnostic.track(10, 500, 'test message 1');
    await diagnostic.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(DIAGNOSTIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: '',
        omni_metrics: [
          {
            metadata_type: DIAGNOSTIC_METADATA_TYPE,
            library: 'amplitude-ts',
            accounting_time_min: Math.floor(1697583342266 / 60 / 1000),
            response_code: 400,
            trigger: 'test message 0',
            action: 'drop events',
            event_count: 5,
          },
          {
            metadata_type: DIAGNOSTIC_METADATA_TYPE,
            library: 'amplitude-ts',
            accounting_time_min: Math.floor(1697583342266 / 60 / 1000),
            response_code: 500,
            trigger: 'test message 1',
            action: 'drop events',
            event_count: 10,
          },
        ],
      }),
    });
    fetchMock.mockRestore();
  });
});
