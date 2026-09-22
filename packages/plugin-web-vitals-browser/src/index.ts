import { WebVitalsOptions } from '@amplitude/analytics-core';
import { webVitalsPlugin as createWebVitalsPlugin } from './web-vitals-plugin';
import { webVitalsSoftNavPlugin } from './web-vitals-soft-nav-plugin';

export { VERSION } from './version';
export { webVitalsSoftNavPlugin };

const isSoftNavSupported = () => {
  return 'PerformanceSoftNavigation' in window;
};

/**
 * Creates the web vitals plugin. When `reportSoftNav` is enabled, uses the soft-navigation
 * plugin so each navigation (including SPA route changes) is reported separately.
 */
export const webVitalsPlugin = (options: WebVitalsOptions = {}) => {
  if (options.reportSoftNav === true && isSoftNavSupported()) {
    return webVitalsSoftNavPlugin();
  }
  return createWebVitalsPlugin();
};

export { webVitalsPlugin as plugin };
