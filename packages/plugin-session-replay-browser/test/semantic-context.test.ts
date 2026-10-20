import { semanticAutocaptureFamilies } from '../src/semantic-context';

describe('semantic analytics context', () => {
  test('boolean autocapture uses the current analytics-browser defaults', () => {
    expect(semanticAutocaptureFamilies(true)).toEqual([
      'attribution',
      'fileDownloads',
      'formInteractions',
      'pageViews',
      'sessions',
      'elementInteractions',
      'webVitals',
      'frustrationInteractions',
    ]);
    expect(semanticAutocaptureFamilies(false)).toEqual([]);
    expect(semanticAutocaptureFamilies(undefined)).toEqual([]);
  });

  test.each([
    [{}, true],
    [{ deadClicks: true }, true],
    [{ deadClicks: false }, false],
    [{ deadClicks: false, errorClicks: true }, true],
    [{ deadClicks: false, errorClicks: {} }, true],
    [{ deadClicks: false, errorClicks: false, rageClicks: true }, false],
  ])('reports dead/error detector availability for %p', (frustrationInteractions, enabled) => {
    const families = semanticAutocaptureFamilies({ elementInteractions: true, frustrationInteractions });
    expect(families.includes('frustrationInteractions')).toBe(enabled);
    expect(families).toContain('elementInteractions');
  });
});
