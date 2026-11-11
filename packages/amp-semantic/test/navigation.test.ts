import { createSemanticCapture, SemanticEvent } from '../src';
import { navigationRecorder } from '../src/recorders/navigation';
import { urlTemplate } from '../src/url';

test('templates paths and hash routes without origin or query values', () => {
  expect(urlTemplate('https://example.com/accounts/8812/billing?token=secret')).toBe('/accounts/:id/billing');
  expect(urlTemplate('https://example.com/app#/accounts/8812?token=secret')).toBe('/app#/accounts/:id');
  expect(urlTemplate('data:text/plain,secret')).toBe('/');
  expect(urlTemplate('https://example.com/%ZZ')).toBe('/:id');
  expect(urlTemplate('https://example.com/abcdef1234567890')).toBe('/:id');
  expect(urlTemplate('https://example.com/123e4567-e89b-12d3-a456-426614174000')).toBe('/:id');
  expect(urlTemplate('https://example.com/abcdefghijkl123456789')).toBe('/:id');
  expect(urlTemplate('http://%')).toBe('/');
});

test('uses host URL observations, preserving their timestamps and duplicates', () => {
  const events: SemanticEvent[] = [];
  const capture = createSemanticCapture(
    { enabled: true },
    { document, window, sdk: 'test', getPrivacy: () => ({}), emit: (event) => events.push(event) },
    [navigationRecorder],
  );
  capture.start();
  capture.notify('url', { url: 'https://example.com/accounts/8812?private=one', timestamp: 123 });
  capture.notify('url', { url: 'https://example.com/accounts/8812?private=two', timestamp: 124 });
  capture.notify('url', { url: ' ', timestamp: 125 });
  expect(events.map((event) => event.timestamp)).toEqual([123, 124]);
  expect(events.map((event) => (event.name === 'navigation' ? event.payload.url : undefined))).toEqual([
    '/accounts/:id',
    '/accounts/:id',
  ]);
  capture.stop();
  capture.notify('url', { url: 'https://example.com/after', timestamp: 126 });
  expect(events).toHaveLength(2);
});
