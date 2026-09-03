/**
 * Configuration options for web vitals tracking.
 */
export interface WebVitalsOptions {
  /**
   * Enables/disables reporting web vitals for soft navigations, in addition to the initial page load.
   *
   * Single page applications update the URL and history without a full page navigation, so by default
   * Core Web Vitals are only measured once, for the initial page load. When this is enabled, LCP, FCP,
   * INP, CLS and TTFB are also measured per soft navigation, and one `[Amplitude] Web Vitals` event is
   * sent per navigation with the page properties of the URL the metrics belong to.
   *
   * Requires browser support for the Soft Navigations API (Chromium 151+). In browsers without it,
   * reporting is unchanged from the default behavior.
   *
   * See {@link https://github.com/WICG/soft-navigations}.
   *
   * @defaultValue `false`
   */
  reportSoftNav?: boolean;
}
