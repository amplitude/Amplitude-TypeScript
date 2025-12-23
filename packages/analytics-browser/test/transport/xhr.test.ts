import { XHRTransport } from '../../src/transports/xhr';
import { Status } from '@amplitude/analytics-core';

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
  });
});
