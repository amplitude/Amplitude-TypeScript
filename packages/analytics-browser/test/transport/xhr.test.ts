import { ReadableStream, WritableStream } from 'stream/web';
import { TextEncoder } from 'util';
import { compressToGzipArrayBuffer, MIN_GZIP_UPLOAD_BODY_SIZE_BYTES, Status } from '@amplitude/analytics-core';
import { XHRTransport } from '../../src/transports/xhr';

if (typeof global.TextEncoder === 'undefined') {
  (global as typeof globalThis & { TextEncoder?: typeof TextEncoder }).TextEncoder = TextEncoder;
}

describe('xhr', () => {
  describe('send', () => {
    test.each([
      ['{}'], // ideally response body should be json format to an application/json request
      [''], // test the edge case where response body is non-json format
      ['<'],
    ])('should resolve with response', async (body) => {
      const transport = new XHRTransport();
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
      const xhr = new XMLHttpRequest();
      const open = jest.fn();
      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mock = {
        ...xhr,
        open,
        setRequestHeader,
        send,
        readyState: 4,
        responseText: body,
      };
      jest.spyOn(window, 'XMLHttpRequest').mockReturnValueOnce(mock);
      jest.spyOn(transport, 'buildResponse').mockReturnValueOnce(result);

      const unresolvedResponse = transport.send(url, payload);
      expect(mock.onreadystatechange).toBeDefined();
      mock.onreadystatechange && mock.onreadystatechange(new Event(''));
      const response = await unresolvedResponse;
      expect(response).toBe(result);
      expect(open).toHaveBeenCalledWith('POST', url, true);
      expect(setRequestHeader).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(JSON.stringify(payload));
    });

    test('should include custom headers in request', async () => {
      const customHeaders = {
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      };
      const transport = new XHRTransport(customHeaders);
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
      const xhr = new XMLHttpRequest();
      const open = jest.fn();
      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mock = {
        ...xhr,
        open,
        setRequestHeader,
        send,
        readyState: 4,
        responseText: '{}',
      };
      jest.spyOn(window, 'XMLHttpRequest').mockReturnValueOnce(mock);
      jest.spyOn(transport, 'buildResponse').mockReturnValueOnce(result);

      const unresolvedResponse = transport.send(url, payload);
      mock.onreadystatechange && mock.onreadystatechange(new Event(''));
      await unresolvedResponse;

      expect(setRequestHeader).toHaveBeenCalledTimes(4); // Content-Type, Accept, + 2 custom headers
      expect(setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(setRequestHeader).toHaveBeenCalledWith('Accept', '*/*');
      expect(setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer token123');
      expect(setRequestHeader).toHaveBeenCalledWith('X-Custom-Header', 'custom-value');
    });

    test('should allow custom headers to override defaults', async () => {
      const customHeaders = {
        'Content-Type': 'text/plain',
        Accept: 'application/json',
      };
      const transport = new XHRTransport(customHeaders);
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
      const xhr = new XMLHttpRequest();
      const open = jest.fn();
      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mock = {
        ...xhr,
        open,
        setRequestHeader,
        send,
        readyState: 4,
        responseText: '{}',
      };
      jest.spyOn(window, 'XMLHttpRequest').mockReturnValueOnce(mock);
      jest.spyOn(transport, 'buildResponse').mockReturnValueOnce(result);

      const unresolvedResponse = transport.send(url, payload);
      mock.onreadystatechange && mock.onreadystatechange(new Event(''));
      await unresolvedResponse;

      // Custom headers should override defaults, so only 2 calls total
      expect(setRequestHeader).toHaveBeenCalledTimes(2);
      expect(setRequestHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(setRequestHeader).toHaveBeenCalledWith('Accept', 'application/json');
    });

    test('should work without custom headers (backward compatibility)', async () => {
      const transport = new XHRTransport();
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
      const xhr = new XMLHttpRequest();
      const open = jest.fn();
      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mock = {
        ...xhr,
        open,
        setRequestHeader,
        send,
        readyState: 4,
        responseText: '{}',
      };
      jest.spyOn(window, 'XMLHttpRequest').mockReturnValueOnce(mock);
      jest.spyOn(transport, 'buildResponse').mockReturnValueOnce(result);

      const unresolvedResponse = transport.send(url, payload);
      mock.onreadystatechange && mock.onreadystatechange(new Event(''));
      await unresolvedResponse;

      expect(setRequestHeader).toHaveBeenCalledTimes(2); // Only Content-Type and Accept
      expect(setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(setRequestHeader).toHaveBeenCalledWith('Accept', '*/*');
    });

    test('compressToGzipArrayBuffer returns undefined when CompressionStream is not available', async () => {
      const g = global as { CompressionStream?: unknown };
      const originalCompressionStream = g.CompressionStream;
      // Set to undefined (don't delete) so the code hits our return instead of ReferenceError
      g.CompressionStream = undefined;

      const result = await compressToGzipArrayBuffer('data');
      expect(result).toBeUndefined();

      g.CompressionStream = originalCompressionStream;
    });

    test('when shouldCompressUploadBody is true but CompressionStream is not available, should send uncompressed body', async () => {
      const g = global as { CompressionStream?: unknown };
      const originalCompressionStream = g.CompressionStream;
      delete g.CompressionStream;

      const transport = new XHRTransport();
      const url = 'http://localhost:3000';
      const payload = { api_key: '', events: [] };

      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mockXhr = {
        open: jest.fn(),
        setRequestHeader,
        send,
        readyState: 4,
        responseText: '{}',
        onreadystatechange: null as (() => void) | null,
      };
      jest.spyOn(global, 'XMLHttpRequest').mockImplementation(() => mockXhr as unknown as XMLHttpRequest);

      const sendPromise = transport.send(url, payload, true);
      mockXhr.onreadystatechange?.();
      await sendPromise;

      expect(setRequestHeader).not.toHaveBeenCalledWith('Content-Encoding', 'gzip');
      expect(send).toHaveBeenCalledWith(JSON.stringify(payload));

      g.CompressionStream = originalCompressionStream;
    });

    test('when shouldCompressUploadBody is true but compression returns undefined, should send uncompressed body', async () => {
      const g = global as { CompressionStream?: unknown; Response?: unknown };
      const originalCompressionStream = g.CompressionStream;
      const originalResponse = g.Response;

      const mockCompressedStream = {};
      const pipeThrough = jest.fn().mockReturnValue(mockCompressedStream);
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => ({ pipeThrough }),
        configurable: true,
        writable: true,
      });

      g.CompressionStream = jest.fn();
      g.Response = jest.fn().mockImplementation(() => ({
        arrayBuffer: () => Promise.reject(new Error('compression failed')),
      }));

      const transport = new XHRTransport();
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

      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mockXhr = {
        open: jest.fn(),
        setRequestHeader,
        send,
        readyState: 4,
        responseText: '{}',
        onreadystatechange: null as (() => void) | null,
      };
      jest.spyOn(global, 'XMLHttpRequest').mockImplementation(() => mockXhr as unknown as XMLHttpRequest);

      const sendPromise = transport.send(url, payload, true);
      await new Promise((r) => setTimeout(r, 0));
      mockXhr.onreadystatechange?.();
      await sendPromise;

      expect(setRequestHeader).not.toHaveBeenCalledWith('Content-Encoding', 'gzip');
      expect(send).toHaveBeenCalledWith(JSON.stringify(payload));

      g.CompressionStream = originalCompressionStream;
      g.Response = originalResponse;
      delete (Blob.prototype as unknown as { stream?: () => unknown }).stream;
    });

    test('when payload is below compression threshold, should send uncompressed body', async () => {
      const g = global as { CompressionStream?: unknown };
      const originalCompressionStream = g.CompressionStream;
      const MockCompressionStream = jest.fn();
      g.CompressionStream = MockCompressionStream;

      const transport = new XHRTransport();
      const url = 'http://localhost:3000';
      const payload = { api_key: '', events: [] };

      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mockXhr = {
        open: jest.fn(),
        setRequestHeader,
        send,
        readyState: 4,
        responseText: '{}',
        onreadystatechange: null as (() => void) | null,
      };
      jest.spyOn(global, 'XMLHttpRequest').mockImplementation(() => mockXhr as unknown as XMLHttpRequest);

      const sendPromise = transport.send(url, payload, true);
      mockXhr.onreadystatechange?.();
      await sendPromise;

      expect(setRequestHeader).not.toHaveBeenCalledWith('Content-Encoding', 'gzip');
      expect(send).toHaveBeenCalledWith(JSON.stringify(payload));
      expect(MockCompressionStream).not.toHaveBeenCalled();

      g.CompressionStream = originalCompressionStream;
    });

    test('should send gzip-compressed body with Content-Encoding when shouldCompressUploadBody is true', async () => {
      const mockCompressedBytes = new Uint8Array([0x1f, 0x8b]); // gzip magic number
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
      const MockCompressionStream = jest.fn().mockImplementation(() => ({
        readable: mockReadable,
        writable: new WritableStream(),
      }));
      (global as { CompressionStream?: unknown }).CompressionStream = MockCompressionStream;

      // jsdom Blob doesn't implement .stream(); provide one (same as fetch.test.ts)
      const blobStreamSource = new ReadableStream<Uint8Array>();
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => blobStreamSource,
        configurable: true,
        writable: true,
      });

      const transport = new XHRTransport();
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

      const open = jest.fn();
      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mockXhr = {
        open,
        setRequestHeader,
        send,
        readyState: 4,
        responseText: '{}',
        onreadystatechange: null as (() => void) | null,
      };
      jest.spyOn(global, 'XMLHttpRequest').mockImplementation(() => mockXhr as unknown as XMLHttpRequest);

      const sendPromise = transport.send(url, payload, true);
      // Allow compressToGzipArrayBuffer (Response(stream).arrayBuffer()) to resolve before resolving send promise
      await new Promise((r) => setTimeout(r, 0));
      mockXhr.onreadystatechange?.();
      await sendPromise;

      expect(setRequestHeader).toHaveBeenCalledWith('Content-Encoding', 'gzip');
      expect(send).toHaveBeenCalledTimes(1);
      const sentBody = send.mock.calls[0][0];
      expect(sentBody).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(sentBody as ArrayBuffer)).toEqual(mockCompressedBytes);

      (global as { Response?: unknown }).Response = OriginalResponse;
      delete (Blob.prototype as unknown as { stream?: () => ReadableStream }).stream;
      const g = global as { CompressionStream?: unknown };
      delete g.CompressionStream;
    });

    test('should keep body uncompressed when compression flag is false', async () => {
      const transport = new XHRTransport();
      const url = 'https://api2.amplitude.com/2/httpapi';
      const payload = { api_key: '', events: [{ event_type: 'test', device_id: 'test_device_id' }] };
      const MockCompressionStream = jest.fn();
      (global as { CompressionStream?: unknown }).CompressionStream = MockCompressionStream;

      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mockXhr = {
        open: jest.fn(),
        setRequestHeader,
        send,
        readyState: 4,
        responseText: '{}',
        onreadystatechange: null as (() => void) | null,
      };
      jest.spyOn(global, 'XMLHttpRequest').mockImplementation(() => mockXhr as unknown as XMLHttpRequest);

      const sendPromise = transport.send(url, payload, false);
      mockXhr.onreadystatechange?.();
      await sendPromise;

      expect(setRequestHeader).not.toHaveBeenCalledWith('Content-Encoding', 'gzip');
      expect(send).toHaveBeenCalledWith(JSON.stringify(payload));
      expect(MockCompressionStream).not.toHaveBeenCalled();

      delete (global as { CompressionStream?: unknown }).CompressionStream;
    });

    test('should respect custom Content-Encoding header when compressing', async () => {
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
      const MockCompressionStream = jest.fn().mockImplementation(() => ({
        readable: mockReadable,
        writable: new WritableStream(),
      }));
      (global as { CompressionStream?: unknown }).CompressionStream = MockCompressionStream;

      const blobStreamSource = new ReadableStream<Uint8Array>();
      Object.defineProperty(Blob.prototype, 'stream', {
        value: () => blobStreamSource,
        configurable: true,
        writable: true,
      });

      const transport = new XHRTransport({ 'Content-Encoding': 'br' });
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

      const setRequestHeader = jest.fn();
      const send = jest.fn();
      const mockXhr = {
        open: jest.fn(),
        setRequestHeader,
        send,
        readyState: 4,
        responseText: '{}',
        onreadystatechange: null as (() => void) | null,
      };
      jest.spyOn(global, 'XMLHttpRequest').mockImplementation(() => mockXhr as unknown as XMLHttpRequest);

      const sendPromise = transport.send(url, payload, true);
      await new Promise((r) => setTimeout(r, 0));
      mockXhr.onreadystatechange?.();
      await sendPromise;

      expect(setRequestHeader).toHaveBeenCalledWith('Content-Encoding', 'br');

      (global as { Response?: unknown }).Response = OriginalResponse;
      delete (Blob.prototype as unknown as { stream?: () => ReadableStream }).stream;
      const g = global as { CompressionStream?: unknown };
      delete g.CompressionStream;
    });
  });
});
