import { filterTopLevelZones } from '../src/hierarchy';
import type { Zone } from '../src/types';

describe('filterTopLevelZones', () => {
  it('deduplicates zones by id', () => {
    const el = document.createElement('button');
    el.id = 'dup';
    const zone: Zone = {
      id: 'button#dup',
      htmlElement: el,
      rect: new DOMRect(),
      isActive: true,
      percentage: 1,
      hasContent: true,
    };
    const result = filterTopLevelZones([zone, zone]);
    expect(result).toHaveLength(1);
  });
});
