import { createNetworkRequestEvent, type NetworkRequestEventProperties } from '../src/index';

// Exercise the package entry point and its public input type as a customer would.
test('exports a network event factory for custom HTTP clients', () => {
  const properties: NetworkRequestEventProperties = {
    url: 'https://api.example.com/orders',
    method: 'GET',
    startTime: 1700000000000,
    duration: 120,
    statusCode: 200,
  };
  expect(createNetworkRequestEvent(properties)).toMatchObject({
    event_type: '[Amplitude] Network Request',
    event_properties: {
      '[Amplitude] URL': 'https://api.example.com/orders',
      '[Amplitude] Status Code': 200,
      '[Amplitude] Completion Time': 1700000000120,
      '[Amplitude] Request Type': 'custom',
    },
  });
});
