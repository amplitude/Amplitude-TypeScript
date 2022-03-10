import { SendBeaconTransport } from '../../src/transports/send-beacon';
import { Status } from '@amplitude/analytics-types';

describe('beacon', () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const beacon = window.navigator.sendBeacon;

  beforeEach(() => {
    window.navigator.sendBeacon = jest.fn();
  });

  afterEach(() => {
    window.navigator.sendBeacon = beacon;
  });

  describe('send', () => {
    test('should resolve with response', async () => {
      const transport = new SendBeaconTransport();
      const url = 'http://localhost:3000';
      const payload = {
        api_key: '',
        events: [],
      };
      jest.spyOn(window.navigator, 'sendBeacon').mockReturnValueOnce(true);
      const response = await transport.send(url, payload);
      expect(response).toEqual({
        statusCode: 200,
        status: Status.Success,
        body: {
          eventsIngested: 0,
          payloadSizeBytes: 26,
          // serverUploadTime is equal to Date.now() which is different each test execution
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          serverUploadTime: expect.any(Number),
        },
      });
    });

    test('should handle failed send beacon attempt', async () => {
      const transport = new SendBeaconTransport();
      const url = 'http://localhost:3000';
      const payload = {
        api_key: '',
        events: [],
      };
      jest.spyOn(window.navigator, 'sendBeacon').mockReturnValueOnce(false);
      const response = await transport.send(url, payload);
      expect(response).toEqual({
        statusCode: 500,
        status: Status.Failed,
      });
    });

    test('should handle unexpected error', async () => {
      const transport = new SendBeaconTransport();
      const url = 'http://localhost:3000';
      const payload = {
        api_key: '',
        events: [],
      };
      jest.spyOn(window.navigator, 'sendBeacon').mockImplementationOnce(() => {
        throw new Error('sendBeacon error');
      });
      await expect(transport.send(url, payload)).rejects.toThrow('sendBeacon error');
    });
  });
});
