import { FetchTransport } from '../../src/transports/fetch';
import * as core from '@amplitude/analytics-core';
import { Status } from '@amplitude/analytics-types';
import 'isomorphic-fetch';

describe('fetch', () => {
  describe('send', () => {
    test('should resolve with response', async () => {
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
      jest.spyOn(window, 'fetch').mockReturnValueOnce(Promise.resolve(new Response('{}')));
      jest.spyOn(core, 'buildResponse').mockReturnValueOnce(result);
      const response = await transport.send(url, payload);
      expect(response).toEqual(result);
    });
  });
});
