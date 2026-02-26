import { ReadableStream, WritableStream } from 'stream/web';
import { TextEncoder } from 'util';
import { MIN_GZIP_UPLOAD_BODY_SIZE_BYTES, Status } from '@amplitude/analytics-core';
import { FetchTransport } from '../../src/transports/fetch';
import 'isomorphic-fetch';

if (typeof global.TextEncoder === 'undefined') {
  (global as typeof globalThis & { TextEncoder?: typeof TextEncoder }).TextEncoder = TextEncoder;
}

describe('fetch transport', () => {
  describe('send', () => {
    test.each([['{}'], [''], ['<']])('should resolve with response', async (body) => {
      const transport = new FetchTransport();
      const url = 'http://localhost:3000';
      const payload = { api_key: '', events: [] };
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

    test('should include custom headers', async () => {
      const transport = new FetchTransport({ Authorization: 'Bearer token123' });
      const url = 'http://localhost:3000';
      const payload = { api_key: '', events: [] };

      const fetchSpy = jest.spyOn(window, 'fetch').mockReturnValueOnce(Promise.resolve(new Response('{}')));
      await transport.send(url, payload, false);

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

    test('should keep body uncompressed when compression flag is false', async () => {
      const transport = new FetchTransport();
      const url = 'http://localhost:3000';
      const payload = { api_key: '', events: [{ event_type: 'test', device_id: 'test_device_id' }] };
      const mockCompressionStream = jest.fn();
      (global as typeof globalThis & { CompressionStream?: unknown }).CompressionStream = mockCompressionStream;

      const fetchSpy = jest.spyOn(window, 'fetch').mockReturnValueOnce(Promise.resolve(new Response('{}')));
      await transport.send(url, payload, false);

      expect(fetchSpy).toHaveBeenCalledWith(url, {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
        },
        body: JSON.stringify(payload),
        method: 'POST',
      });
      expect(mockCompressionStream).not.toHaveBeenCalled();

      delete (global as { CompressionStream?: unknown }).CompressionStream;
    });

    test('should send gzip-compressed body when compression flag is true', async () => {
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
      (global as { CompressionStream?: unknown }).CompressionStream = jest.fn().mockImplementation(() => ({
        readable: mockReadable,
        writable: new WritableStream(),
      }));

      const blobStreamSource = new ReadableStream<Uint8Array>();
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => blobStreamSource,
        configurable: true,
        writable: true,
      });

      const transport = new FetchTransport();
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

      const fetchSpy = jest
        .spyOn(window, 'fetch')
        .mockReturnValueOnce(Promise.resolve({ text: () => Promise.resolve('{}') } as Response));
      await transport.send(url, payload, true);

      const [, options] = fetchSpy.mock.calls[0];
      expect(options?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Accept: '*/*',
        'Content-Encoding': 'gzip',
      });
      expect(options?.body).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(options?.body as ArrayBuffer)).toEqual(mockCompressedBytes);

      (global as { Response?: unknown }).Response = OriginalResponse;
      delete (Blob.prototype as unknown as { stream?: () => ReadableStream }).stream;
      delete (global as { CompressionStream?: unknown }).CompressionStream;
    });

    test('should respect Content-Encoding header when compression is enabled', async () => {
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
      (global as { CompressionStream?: unknown }).CompressionStream = jest.fn().mockImplementation(() => ({
        readable: mockReadable,
        writable: new WritableStream(),
      }));

      const blobStreamSource = new ReadableStream<Uint8Array>();
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => blobStreamSource,
        configurable: true,
        writable: true,
      });

      const transport = new FetchTransport({ 'Content-Encoding': 'br' });
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

      const fetchSpy = jest
        .spyOn(window, 'fetch')
        .mockReturnValueOnce(Promise.resolve({ text: () => Promise.resolve('{}') } as Response));
      await transport.send(url, payload, true);

      const [, options] = fetchSpy.mock.calls[0];
      expect(options?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Accept: '*/*',
        'Content-Encoding': 'gzip',
      });

      (global as { Response?: unknown }).Response = OriginalResponse;
      delete (Blob.prototype as unknown as { stream?: () => ReadableStream }).stream;
      delete (global as { CompressionStream?: unknown }).CompressionStream;
    });
  });
});
