import { describe, it, expect } from 'vitest';
import { eventsToItems } from '../src/detect/normalize';

describe('eventsToItems', () => {
  it('extracts string values from event_properties', () => {
    const items = eventsToItems([{ event_type: 'Test', event_properties: { email: 'm.chen@example.com', count: 3 } }]);
    const vals = items.map((i) => i.value);
    expect(vals).toContain('m.chen@example.com');
    expect(vals).not.toContain('3'); // non-strings skipped here; deterministic pass handles numerics later
  });
  it('marks amplitude element events as autocapture', () => {
    const items = eventsToItems([
      {
        event_type: '[Amplitude] Element Clicked',
        event_properties: {
          '[Amplitude] Element Text': 'M. Chen',
          '[Amplitude] Element Selector': '#holder',
        },
      },
    ]);
    expect(items[0].source).toBe('autocapture');
    expect(items[0].selector).toBe('#holder');
  });
});
