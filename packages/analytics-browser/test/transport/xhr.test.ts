import { XHRTransport } from '../../src/transports/xhr';
import { Status } from '@amplitude/analytics-types';

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
  });
});
