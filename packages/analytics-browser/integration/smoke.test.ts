import { expect } from '@esm-bundle/chai';
import { Identify, Status, type Payload, type Transport } from '@amplitude/analytics-core';
import { AmplitudeBrowser } from '../src/index';

describe('analytics smoke tests', () => {
  let payloads: Payload[] = [];
  let transportProvider: Transport;

  beforeEach(() => {
    payloads = [];
    transportProvider = {
      async send(_serverUrl, payload) {
        payloads.push(payload);
        return {
          status: Status.Success,
          statusCode: 200,
          body: {
            eventsIngested: payload.events.length,
            payloadSizeBytes: 0,
            serverUploadTime: Date.now(),
          },
        };
      },
    };
  });

  it('tracks an event and identify call', async () => {
    const client = new AmplitudeBrowser();
    await client.init('test-api-key', {
      defaultTracking: false,
      autocapture: false,
      fetchRemoteConfig: false,
      flushIntervalMillis: 1,
      flushQueueSize: 1,
      identityStorage: 'none',
    }).promise;

    client.config.transportProvider = transportProvider;

    client.setUserId('test-user-id');
    client.track('test-event', { test_property: 'test-value' });
    const identity = new Identify();
    identity.set('test-property', 'test-value');
    identity.setOnce('test-property-once', 'test-value-once');
    client.identify(identity);
    await client.flush().promise;

    expect(payloads).to.have.lengthOf(2);
    expect(payloads[0].events[0].event_type).to.equal('test-event');
    expect(payloads[0].events[0].event_properties).to.deep.equal({ test_property: 'test-value' });
    expect(payloads[0].events[0].user_id).to.equal('test-user-id');
    expect(payloads[1].events[0].event_type).to.equal('$identify');
    expect(payloads[1].events[0].user_properties).to.deep.equal({
      '$set': {
        'test-property': 'test-value',
      },
      '$setOnce': {
        'test-property-once': 'test-value-once',
      },
    });
  });
});
