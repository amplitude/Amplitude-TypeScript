import * as analyticsCore from '@amplitude/analytics-core';
import { semanticAutocaptureFamilies } from '../src/semantic-context';

describe('semantic analytics context', () => {
  test('boolean autocapture uses the current analytics-browser defaults', () => {
    expect(semanticAutocaptureFamilies(true)).toEqual([
      'attribution',
      'fileDownloads',
      'formInteractions',
      'pageViews',
      'sessions',
      'pageUrlEnrichment',
      'networkTracking',
      'elementInteractions',
      'webVitals',
      'frustrationInteractions',
    ]);
    expect(semanticAutocaptureFamilies(false)).toEqual([]);
    expect(semanticAutocaptureFamilies(undefined)).toEqual([
      'attribution',
      'fileDownloads',
      'formInteractions',
      'pageViews',
      'sessions',
      'pageUrlEnrichment',
    ]);
  });

  test('partial autocapture keeps defaults and reports opt-in families', () => {
    expect(semanticAutocaptureFamilies({ pageViews: false, elementInteractions: true, networkTracking: {} })).toEqual([
      'attribution',
      'fileDownloads',
      'formInteractions',
      'sessions',
      'pageUrlEnrichment',
      'networkTracking',
      'elementInteractions',
    ]);
  });

  test('reports explicitly enabled web vitals and performance tracking', () => {
    const families = semanticAutocaptureFamilies({ webVitals: true, performanceTracking: {} });
    expect(families).toContain('webVitals');
    expect(families).toContain('performanceTracking');
  });

  test('Chrome extensions require explicit opt-in for default-on families', () => {
    const extension = jest.spyOn(analyticsCore, 'isChromeExtension').mockReturnValue(true);
    try {
      expect(semanticAutocaptureFamilies(undefined)).toEqual([]);
      expect(semanticAutocaptureFamilies({ sessions: true, pageUrlEnrichment: true })).toEqual([
        'sessions',
        'pageUrlEnrichment',
      ]);
    } finally {
      extension.mockRestore();
    }
  });

  test('uses effective default tracking for default-on event families', () => {
    expect(
      semanticAutocaptureFamilies(false, {
        attribution: false,
        fileDownloads: false,
        formInteractions: false,
        pageViews: false,
        sessions: true,
      }),
    ).toEqual(['sessions']);
    expect(semanticAutocaptureFamilies({ pageUrlEnrichment: false }, { fileDownloads: false })).toEqual([
      'attribution',
      'formInteractions',
      'pageViews',
      'sessions',
    ]);
  });

  test.each([
    [true, true],
    [false, false],
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
