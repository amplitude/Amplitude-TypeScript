import { fetchRemoteDecision } from '../../src/targeting/remote-eval-client';

describe('fetchRemoteDecision', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  const deploymentKey = 'client-abc123';
  const user = { device_id: 'device-1', user_id: 'user-1' };
  const flagKey = 'sr-capture-gate';

  it('returns capture: true when Amplitude eval returns variant "on"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ [flagKey]: { key: 'on', value: 'on' } }),
    });

    const result = await fetchRemoteDecision(deploymentKey, user, flagKey, 200);
    expect(result).toEqual({ capture: true });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.lab.amplitude.com/sdk/v2/vardata');
    expect(url).toContain('flag_keys=sr-capture-gate');
    expect(url).toContain('device_id=device-1');
    expect(url).toContain('user_id=user-1');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Api-Key ${deploymentKey}`);
  });

  it('returns capture: false when Amplitude eval returns variant "off"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ [flagKey]: { key: 'off' } }),
    });

    const result = await fetchRemoteDecision(deploymentKey, user, flagKey, 200);
    expect(result).toEqual({ capture: false });
  });

  it('returns capture: false when flag key is absent from response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    });

    const result = await fetchRemoteDecision(deploymentKey, user, flagKey, 200);
    expect(result).toEqual({ capture: false });
  });

  it('returns capture: false with reason "http-401" on HTTP 401', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await fetchRemoteDecision(deploymentKey, user, flagKey, 200);
    expect(result).toEqual({ capture: false, reason: 'http-401' });
  });

  it('returns capture: false with reason "http-500" on HTTP 500', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await fetchRemoteDecision(deploymentKey, user, flagKey, 200);
    expect(result).toEqual({ capture: false, reason: 'http-500' });
  });

  it('returns capture: false with reason "error" on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

    const result = await fetchRemoteDecision(deploymentKey, user, flagKey, 200);
    expect(result).toEqual({ capture: false, reason: 'error' });
  });

  it('returns capture: false with reason "timeout" when timeout is exceeded', async () => {
    global.fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const promise = fetchRemoteDecision(deploymentKey, user, flagKey, 100);
    jest.advanceTimersByTime(100);
    const result = await promise;

    expect(result).toEqual({ capture: false, reason: 'timeout' });
  });

  it('omits device_id and user_id query params when not provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ [flagKey]: { key: 'on' } }),
    });

    await fetchRemoteDecision(deploymentKey, {}, flagKey, 200);

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('device_id');
    expect(url).not.toContain('user_id');
  });

  it('uses the correct flag key in the query params', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ 'custom-flag': { key: 'on' } }),
    });

    await fetchRemoteDecision(deploymentKey, user, 'custom-flag', 200);

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('flag_keys=custom-flag');
  });
});
