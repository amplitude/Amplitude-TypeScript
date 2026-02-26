/**
 * @jest-environment jsdom
 */

import { FetchTransport } from '../../src/transports/fetch';
import { Status } from '../../src/types/status';
import 'isomorphic-fetch';

describe('fetch', () => {
  describe('send', () => {
    test.each([
      ['{}'], // ideally response body should be json format to an application/json request
      [''], // test the edge case where response body is non-json format
      ['<'],
    ])('should resolve with response', async (body) => {
      const transport = new FetchTransport();
      const url = 'http://localhost:3000';
      const payload = {
        api_key: '',
        events: [],
      };
      const result = {
        statusCode: 200,
        status: Status.Success as const,
        body: {
          eventsIngested: 0,
          payloadSizeBytes: 0,
          serverUploadTime: 0,
        },
      };
      jest.spyOn(window, 'fetch').mockReturnValueOnce(Promise.resolve(new Response(body)));
      jest.spyOn(transport, 'buildResponse').mockReturnValueOnce(result);
      const response = await transport.send(url, payload);
      expect(response).toEqual(result);
    });

    test('should include custom headers in request', async () => {
      const customHeaders = {
        Authorization: 'Bearer token123',
      };
      const transport = new FetchTransport(customHeaders);
      const url = 'http://localhost:3000';
      const payload = {
        api_key: '',
        events: [],
      };

      const fetchSpy = jest.spyOn(window, 'fetch').mockReturnValueOnce(Promise.resolve(new Response('{}')));

      await transport.send(url, payload);

      expect(fetchSpy).toHaveBeenCalledWith(url, {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          Authorization: 'Bearer token123',
        },
        body: JSON.stringify(payload),
        method: 'POST',
      });
    });

    test('should allow custom headers to override defaults', async () => {
      const customHeaders = {
        'Content-Type': 'text/plain',
        Accept: 'application/json',
      };
      const transport = new FetchTransport(customHeaders);
      const url = 'http://localhost:3000';
      const payload = {
        api_key: '',
        events: [],
      };

      const fetchSpy = jest.spyOn(window, 'fetch').mockReturnValueOnce(Promise.resolve(new Response('{}')));

      await transport.send(url, payload);

      expect(fetchSpy).toHaveBeenCalledWith(url, {
        headers: {
          'Content-Type': 'text/plain',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        method: 'POST',
      });
    });

    test('should work without custom headers (backward compatibility)', async () => {
      const transport = new FetchTransport();
      const url = 'http://localhost:3000';
      const payload = {
        api_key: '',
        events: [],
      };

      const fetchSpy = jest.spyOn(window, 'fetch').mockReturnValueOnce(Promise.resolve(new Response('{}')));

      await transport.send(url, payload);

      expect(fetchSpy).toHaveBeenCalledWith(url, {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
        },
        body: JSON.stringify(payload),
        method: 'POST',
      });
    });
  });
});
