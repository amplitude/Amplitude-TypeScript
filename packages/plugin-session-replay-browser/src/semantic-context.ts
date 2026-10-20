import type { BrowserConfig } from '@amplitude/analytics-core';

/** Mirrors analytics-browser's boolean defaults and frustration-plugin's detector defaults. */
export function semanticAutocaptureFamilies(autocapture: BrowserConfig['autocapture']): string[] {
  if (autocapture === true) {
    return [
      'attribution',
      'fileDownloads',
      'formInteractions',
      'pageViews',
      'sessions',
      'elementInteractions',
      'webVitals',
      'frustrationInteractions',
    ];
  }
  if (!autocapture || typeof autocapture !== 'object') return [];
  return Object.keys(autocapture).filter((key) => {
    const value = autocapture[key as keyof typeof autocapture];
    if (key !== 'frustrationInteractions') return Boolean(value);
    const frustration = autocapture.frustrationInteractions;
    if (frustration === true) return true;
    if (!frustration || typeof frustration !== 'object') return false;
    // Dead clicks default on. Error clicks are currently opt-in in frustration-plugin.
    // Rage/thrashed-cursor-only capture must not suppress the click-outcome fallback.
    return (frustration.deadClicks !== false && frustration.deadClicks !== null) || Boolean(frustration.errorClicks);
  });
}
