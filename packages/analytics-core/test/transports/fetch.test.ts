/**
 * @jest-environment jsdom
 */

import { ReadableStream, WritableStream } from 'stream/web';
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

    test('should send gzip-compressed body with Content-Encoding when shouldCompressUploadBody is true', async () => {
      const mockReadable = new ReadableStream<Uint8Array>();
      const mockCompressionStream = jest.fn().mockImplementation(() => ({
        readable: mockReadable,
        writable: new WritableStream(),
      }));
      (global as typeof globalThis & { CompressionStream?: unknown }).CompressionStream = mockCompressionStream;

      // jsdom Blob doesn't implement .stream(); provide one that returns a pipeThrough-able ReadableStream (Node stream/web)
      const blobStreamSource = new ReadableStream<Uint8Array>();
      // Node stream/web ReadableStream is compatible at runtime with DOM Blob.stream() for this test
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => blobStreamSource,
        configurable: true,
        writable: true,
      });

      const transport = new FetchTransport({}, true);
      const url = 'http://localhost:3000';
      const payload = { api_key: '', events: [] };

      const fetchSpy = jest.spyOn(window, 'fetch').mockReturnValueOnce(Promise.resolve(new Response('{}')));

      await transport.send(url, payload);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, options] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe(url);
      expect(options?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Accept: '*/*',
        'Content-Encoding': 'gzip',
      });
      expect(options?.body).toBe(mockReadable);
      expect(options?.method).toBe('POST');

      delete (Blob.prototype as unknown as { stream?: () => ReadableStream }).stream;
      const g = global as { CompressionStream?: unknown };
      delete g.CompressionStream;
    });
  });
});
