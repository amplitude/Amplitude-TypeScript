import { describe, it, expect } from 'vitest';
import { isIngestUrl, isRemoteConfigUrl, extractEvents } from '../src/inject/amplitude-endpoints';

describe('endpoint matchers', () => {
  it('matches httpapi ingest', () => expect(isIngestUrl('https://api2.amplitude.com/2/httpapi')).toBe(true));
  it('matches eu ingest', () => expect(isIngestUrl('https://api.eu.amplitude.com/2/httpapi')).toBe(true));
  it('matches batch ingest', () => expect(isIngestUrl('https://api2.amplitude.com/batch')).toBe(true));
  it('matches remote config', () =>
    expect(isRemoteConfigUrl('https://sr-client-cfg.amplitude.com/config?...')).toBe(true));
  it('ignores unrelated urls', () => expect(isIngestUrl('https://example.com/api')).toBe(false));
  it('extracts events array', () =>
    expect(extractEvents(JSON.stringify({ events: [{ event_type: 'x' }] })).length).toBe(1));
});
