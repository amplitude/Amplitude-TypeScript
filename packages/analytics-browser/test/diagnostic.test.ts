import { Diagnostic } from '../src/diagnostics/diagnostic';

describe('Diagnostic', () => {
  test('should fetch', async () => {
    const diagnostic = new Diagnostic();
    const fetchMock = jest.fn().mockResolvedValueOnce({} as Response);
    global.fetch = fetchMock;

    diagnostic.track(5, 200, 'Test message');
    await diagnostic.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });
});
