import { BrowserConfig, Event } from '@amplitude/analytics-core';
import { createSnapshotClient } from '../src/snapshot-client';
import { createMockBrowserClient } from './mock-browser-client';

describe('already-enriched engagement snapshot delivery', () => {
  const snapshot = (): Event => ({
    event_type: 'page_view',
    insert_id: 'view',
    time: 1000,
    event_properties: { '[Amplitude] Page Counter': 1 },
    delay: { id: 'group', timeout: 180_000 },
  });
  test('delivers to every destination without rerunning track, before, or enrichment plugins', async () => {
    const client = createMockBrowserClient();
    const config = { optOut: false, pageCounter: 1 } as BrowserConfig;
    const first = jest.fn(async (event: Event) => ({ event, code: 200, message: 'sent' }));
    const second = jest.fn(async (event: Event) => ({ event, code: 200, message: 'sent' }));
    const enrichment = jest.fn(async (event: Event) => event);
    client.timeline.plugins = [
      { name: 'ordinary-page-view', type: 'enrichment', execute: enrichment },
      { name: 'first', type: 'destination', execute: first },
      { name: 'second', type: 'destination', execute: second },
    ];
    const sender = createSnapshotClient(client, config);
    const { event_type, event_properties, ...options } = snapshot();
    const result = await sender.track(event_type, event_properties, options).promise;
    expect(result.code).toBe(200);
    expect(first.mock.calls[0][0]).toEqual(snapshot());
    expect(second.mock.calls[0][0]).toEqual(snapshot());
    expect(first.mock.calls[0][0]).not.toBe(second.mock.calls[0][0]);
    expect(enrichment.mock.calls).toHaveLength(0);
    expect(client.track.mock.calls).toHaveLength(0);
    expect(config.pageCounter).toBe(1);
    client.flush.mockReturnValue({ promise: Promise.resolve() });
    sender.flush();
    expect(client.flush.mock.calls).toHaveLength(1);
  });
  test('returns a result when a destination rejects, without throwing into heartbeat', async () => {
    const client = createMockBrowserClient();
    client.timeline.plugins = [
      {
        type: 'destination',
        execute: async () => {
          throw new Error('delivery failed');
        },
      },
    ];
    const sender = createSnapshotClient(client, { optOut: false } as BrowserConfig);
    expect(await sender.track('page_view').promise).toMatchObject({ code: 0, message: 'Error: delivery failed' });
  });
  test('handles no destinations and checks current consent at send time', async () => {
    const client = createMockBrowserClient();
    const config = { optOut: false } as BrowserConfig;
    const sender = createSnapshotClient(client, config);
    expect(await sender.track('page_view').promise).toMatchObject({ code: 100 });
    config.optOut = true;
    expect(await sender.track('page_view').promise).toMatchObject({ code: 0, message: 'Opt-out is enabled' });
  });
});
