/**
 * @jest-environment jsdom
 */

import { ReadableStream, WritableStream } from 'stream/web';
import { TextEncoder } from 'util';
import { FetchTransport } from '../../src/transports/fetch';
import { MIN_GZIP_UPLOAD_BODY_SIZE_BYTES } from '../../src/transports/gzip';
import { Status } from '../../src/types/status';
import 'isomorphic-fetch';

if (typeof global.TextEncoder === 'undefined') {
  (global as typeof globalThis & { TextEncoder?: typeof TextEncoder }).TextEncoder = TextEncoder;
}

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

    test('should send uncompressed body when payload is below the compression threshold', async () => {
      const mockCompressionStream = jest.fn();
      (global as typeof globalThis & { CompressionStream?: unknown }).CompressionStream = mockCompressionStream;

      const transport = new FetchTransport({}, true);
      const url = 'http://localhost:3000';
      const payload = {
        api_key: '',
        events: [{ event_type: 'test', device_id: 'test_device_id' }],
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
      expect(mockCompressionStream).not.toHaveBeenCalled();

      const g = global as { CompressionStream?: unknown };
      delete g.CompressionStream;
    });

    test('should send gzip-compressed body with Content-Encoding when shouldCompressUploadBody is true', async () => {
      const mockCompressedBytes = new Uint8Array([0x1f, 0x8b]);
      const mockArrayBuffer = new ArrayBuffer(2);
      new Uint8Array(mockArrayBuffer).set(mockCompressedBytes);
      const OriginalResponse = (global as { Response?: typeof Response }).Response;
      (global as { Response?: unknown }).Response = jest.fn().mockImplementation(() => ({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      }));

      const mockReadable = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(mockCompressedBytes);
          controller.close();
        },
      });
      const mockCompressionStream = jest.fn().mockImplementation(() => ({
        readable: mockReadable,
        writable: new WritableStream(),
      }));
      (global as typeof globalThis & { CompressionStream?: unknown }).CompressionStream = mockCompressionStream;

      const blobStreamSource = new ReadableStream<Uint8Array>();
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => blobStreamSource,
        configurable: true,
        writable: true,
      });

      const transport = new FetchTransport({}, true);
      const url = 'http://localhost:3000';
      const payload = {
        api_key: '',
        events: [
          {
            event_type: 'large-payload',
            event_properties: { value: 'a'.repeat(MIN_GZIP_UPLOAD_BODY_SIZE_BYTES) },
          },
        ],
      };

      // Use a response-like object with .text() since global Response is mocked for compressToGzipArrayBuffer
      const fetchSpy = jest
        .spyOn(window, 'fetch')
        .mockReturnValueOnce(Promise.resolve({ text: () => Promise.resolve('{}') } as Response));

      await transport.send(url, payload);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl, options] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe(url);
      expect(options?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Accept: '*/*',
        'Content-Encoding': 'gzip',
      });
      expect(options?.body).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(options?.body as ArrayBuffer)).toEqual(mockCompressedBytes);
      expect(options?.method).toBe('POST');

      (global as { Response?: unknown }).Response = OriginalResponse;
      delete (Blob.prototype as unknown as { stream?: () => ReadableStream }).stream;
      const g = global as { CompressionStream?: unknown };
      delete g.CompressionStream;
    });
  });
});
