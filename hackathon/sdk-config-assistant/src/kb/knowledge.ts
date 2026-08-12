/**
 * Knowledge base — every SDK fact the assistant states lives here.
 * Extracted from the Amplitude-TypeScript monorepo source (see paths in comments).
 */

/** Autocapture toggles, their SDK defaults and plain-english explanations.
 *  Defaults verified in packages/analytics-browser/src/default-tracking.ts:
 *  default-available set (on unless explicitly false): pageViews, sessions,
 *  formInteractions, fileDownloads, attribution. Opt-in set (off unless true/object):
 *  elementInteractions, webVitals, frustrationInteractions, networkTracking. */
export const AUTOCAPTURE_INFO = {
  attribution: {
    label: 'Marketing attribution',
    defaultOn: true,
    short: 'Captures UTM params, referrer and ad click IDs on arrival.',
    detail:
      'Tracks how visitors got to your site: UTM parameters, referrer, and ad click IDs (gclid, fbclid, …) are stored as user properties.',
  },
  pageViews: {
    label: 'Page views',
    defaultOn: true,
    short: 'Sends “[Amplitude] Page Viewed” on page loads and SPA route changes.',
    detail:
      'Automatically tracks a page view on load and on every history change (pushState/popstate) in single-page apps.',
  },
  sessions: {
    label: 'Sessions',
    defaultOn: true,
    short: 'Tracks session start / session end events.',
    detail: 'Sends “[Amplitude] Start Session” and “[Amplitude] End Session” events so you can measure engagement.',
  },
  formInteractions: {
    label: 'Form interactions',
    defaultOn: true,
    short: 'Tracks when users start and submit forms.',
    detail: 'Sends “[Amplitude] Form Started” and “[Amplitude] Form Submitted” events for <form> elements.',
  },
  fileDownloads: {
    label: 'File downloads',
    defaultOn: true,
    short: 'Tracks clicks on links to downloadable files.',
    detail: 'Sends “[Amplitude] File Downloaded” when a user clicks a link to a file (pdf, zip, xlsx, …).',
  },
  elementInteractions: {
    label: 'Element interactions (Visual Labeling)',
    defaultOn: false,
    short: 'Tracks clicks and changes on page elements — no code per element.',
    detail:
      'Sends “[Amplitude] Element Clicked” / “[Amplitude] Element Changed” for interactive elements, powering Visual Labeling: name events in the Amplitude UI after the fact. Off by default; limit it to certain pages with pageUrlAllowlist.',
  },
  webVitals: {
    label: 'Web vitals (performance)',
    defaultOn: false,
    short: 'Captures Core Web Vitals (LCP, CLS, INP, FCP, TTFB).',
    detail:
      'Sends one “[Amplitude] Web Vitals” event per page (when the tab is first hidden) with performance metrics. Off by default.',
  },
  frustrationInteractions: {
    label: 'Frustration signals',
    defaultOn: false,
    short: 'Detects rage clicks and dead clicks.',
    detail:
      'Sends “[Amplitude] Rage Click” (4+ clicks in 1s on the same element) and “[Amplitude] Dead Click” (a click that visibly does nothing within 3s). Off by default.',
  },
} as const;

export type AutocaptureKey = keyof typeof AUTOCAPTURE_INFO;

export const AUTOCAPTURE_KEYS = Object.keys(AUTOCAPTURE_INFO) as AutocaptureKey[];

/** SDK facts verified against the repo (versions from package.json at time of build). */
export const SDK = {
  browserPackage: '@amplitude/analytics-browser',
  browserVersion: '2.45.5',
  unifiedPackage: '@amplitude/unified',
  unifiedVersion: '1.1.28',
  /** Key-based script loader (the snippet the Amplitude app generates):
   *  bundles Analytics + the Session Replay plugin, exposed as window.amplitude / window.sessionReplay. */
  keyScriptCdn: 'https://cdn.amplitude.com/script/YOUR_API_KEY.js',
  /**
   * Remote config default: TRUE since browser SDK 2.13.0
   * (packages/analytics-browser/src/config.ts — fetchRemoteConfig = true).
   * Modern option is nested: remoteConfig.fetchRemoteConfig; top-level flag is deprecated.
   */
  remoteConfigDefault: true,
  /** Session Replay records nothing unless sampleRate is set (DEFAULT_SAMPLE_RATE = 0). */
  srDefaultSampleRate: 0,
  /**
   * URL allowlists (elementInteractions/frustrationInteractions pageUrl{Allow,Exclude}list)
   * are matched against the FULL raw window.location.href. String entries are exact
   * whole-string equality; RegExp entries are unanchored url.match().
   * Source: packages/analytics-core/src/utils/url-utils.ts (isUrlMatchAllowlist).
   */
  urlMatchTarget: 'window.location.href',
};
