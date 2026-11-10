import { isChromeExtension, type BrowserConfig } from '@amplitude/analytics-core';

type DefaultFamily = 'attribution' | 'fileDownloads' | 'formInteractions' | 'pageViews' | 'sessions';

/** Mirrors analytics-browser's default-on tracking rules without importing the browser package. */
function isDefaultFamilyEnabled(
  config: BrowserConfig['autocapture'] | BrowserConfig['defaultTracking'],
  key: DefaultFamily | 'pageUrlEnrichment',
): boolean {
  if (typeof config === 'boolean') return config;
  const value = config && typeof config === 'object' ? (config as Record<string, unknown>)[key] : undefined;
  if (value === false) return false;
  return isChromeExtension() ? Boolean(value) : true;
}

function isExplicitlyEnabled(value: unknown): boolean {
  return value === true || (typeof value === 'object' && value !== null);
}

/** Reports the analytics SDK features active alongside semantic capture. */
export function semanticAutocaptureFamilies(
  autocapture: BrowserConfig['autocapture'],
  defaultTracking: BrowserConfig['defaultTracking'] = autocapture,
): string[] {
  const families: string[] = [];
  const defaultFamilies: DefaultFamily[] = [
    'attribution',
    'fileDownloads',
    'formInteractions',
    'pageViews',
    'sessions',
  ];
  for (const key of defaultFamilies) {
    if (isDefaultFamilyEnabled(defaultTracking, key)) families.push(key);
  }
  if (isDefaultFamilyEnabled(autocapture, 'pageUrlEnrichment')) families.push('pageUrlEnrichment');

  if (autocapture === true) {
    families.push('networkTracking', 'elementInteractions', 'webVitals', 'frustrationInteractions');
  } else if (autocapture && typeof autocapture === 'object') {
    if (isExplicitlyEnabled(autocapture.networkTracking)) families.push('networkTracking');
    if (isExplicitlyEnabled(autocapture.elementInteractions)) families.push('elementInteractions');
    if (isExplicitlyEnabled(autocapture.webVitals)) families.push('webVitals');
    if (isExplicitlyEnabled(autocapture.performanceTracking)) families.push('performanceTracking');

    const frustration = autocapture.frustrationInteractions;
    if (
      frustration === true ||
      (frustration &&
        typeof frustration === 'object' &&
        // Dead clicks default on. Error clicks are currently opt-in in frustration-plugin.
        ((frustration.deadClicks !== false && frustration.deadClicks !== null) || Boolean(frustration.errorClicks)))
    ) {
      families.push('frustrationInteractions');
    }
  }
  return families;
}
