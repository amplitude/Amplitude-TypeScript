import { createDefaultValues } from './fields.js';

// Mirrors the AutocaptureOptions interface in
// packages/analytics-core/src/types/config/browser-config.ts — same order, same documented defaults.
// Each `description` is the JSDoc from the corresponding interface property, shown as the field's
// tooltip. PageTrackingOptions has no JSDoc on its members, so those descriptions are summarised
// from the types instead.
//
// Sub-options cover the nested config each autocapture option accepts in place of a boolean, limited
// to what a form can express: booleans, strings, numbers, enums and string lists. Deliberately not
// exposed, because a form can't represent them:
//   - callbacks: shouldTrackEventResolver, shouldTrackSubmit, pageViews.trackOn's function form
//   - deprecated fields: elementInteractions.debounceTime / exposureDuration
//   - remote-config-only or deeply nested: networkTracking.captureRules, elementInteractions.pageActions,
//     elementInteractions.maskTextRegex / visualTaggingOptions
// Options whose nested form is itself an object (deadClicks, rageClicks, mainThreadBlock) are exposed
// as the booleans that switch them on, which is the form the SDK also accepts.

// Fields of NetworkCaptureRule (packages/analytics-core/src/types/network-tracking.ts). `headers`
// covers `string[] | boolean`; `bodyRule` covers BodyCaptureRule, minus its deprecated `blocklist`.
export const CAPTURE_RULE_FIELDS = [
  {
    key: 'hosts',
    label: 'Hosts',
    type: 'stringList',
    hint: "default: ['*'] · supports wildcards",
    description: 'Hosts to allow for network capture. Supports wildcard.',
  },
  {
    key: 'urls',
    label: 'URLs',
    type: 'regexList',
    regexLabel: 'URL regexes',
    hint: "default: ['*'] · takes precedence over hosts",
    description: 'URL patterns to allow for network capture. Supports wildcard. This takes precedence over hosts.',
  },
  {
    key: 'methods',
    label: 'Methods',
    type: 'stringList',
    hint: "default: ['*']",
    description: 'Methods to allow for network capture.',
  },
  {
    key: 'statusCodeRange',
    label: 'Status code range',
    type: 'string',
    hint: "default: '500-599'",
    description: 'Range list that defines the status codes to be captured.',
  },
  {
    key: 'requestHeaders',
    label: 'Request headers',
    type: 'headers',
    hint: 'default: false',
    description:
      'Capture headers from network request. If true, SAFE_HEADERS are captured. If false, no headers are captured. If a string array, the headers in the array are captured.',
  },
  {
    key: 'responseHeaders',
    label: 'Response headers',
    type: 'headers',
    hint: 'default: false',
    description:
      'Capture headers from network response. If true, SAFE_HEADERS are captured. If false, no headers are captured. If a string array, the headers in the array are captured.',
  },
  {
    key: 'requestBody',
    label: 'Request body',
    type: 'bodyRule',
    description: 'Determines what to capture from the request body.',
  },
  {
    key: 'responseBody',
    label: 'Response body',
    type: 'bodyRule',
    description: 'Determines what to capture from the response body.',
  },
];

// Descriptions for the two BodyCaptureRule members, used by the rule editor.
export const BODY_RULE_DESCRIPTIONS = {
  allowlist:
    'List of JSON pointers to capture from a request or response body (JSON objects only). Includes nothing by default. Any keys defined in excludelist will be excluded from the capture. The leading / is optional, * matches any key, ** matches any number of keys, and the structure of the JSON is preserved.',
  excludelist:
    'List of JSON pointers to exclude from a request or response body (JSON objects only). This "uncaptures" any attributes that are captured by the allowlist.',
};

// Rules carry an id purely so React list keys stay stable when one is removed; the serializer walks
// CAPTURE_RULE_FIELDS, so it never reaches the snippet.
let nextRuleId = 0;
export function createCaptureRule() {
  nextRuleId += 1;
  return {
    id: `rule-${nextRuleId}`,
    hosts: '',
    urls: { list: '', regexes: '' },
    methods: '',
    statusCodeRange: '',
    requestHeaders: { mode: '', list: '' },
    responseHeaders: { mode: '', list: '' },
    requestBody: { allowlist: '', excludelist: '' },
    responseBody: { allowlist: '', excludelist: '' },
  };
}

// Shared links restore rules with their original ids, so bump the counter past anything already in
// use before the next createCaptureRule() call.
export function rememberCaptureRuleIds(rules = []) {
  for (const rule of rules) {
    const match = /^rule-(\d+)$/.exec(rule?.id);
    if (match) {
      nextRuleId = Math.max(nextRuleId, Number(match[1]));
    }
  }
}

const pageUrlAllowlist = {
  key: 'pageUrlAllowlist',
  label: 'Page URL allowlist',
  type: 'regexList',
  hint: 'default: all pages',
  description:
    'List of page URLs to allow auto tracking on. When provided, only allow tracking on these URLs. Both full URLs and regex are supported.',
};

const pageUrlExcludelist = {
  key: 'pageUrlExcludelist',
  label: 'Page URL excludelist',
  type: 'regexList',
  hint: 'default: none',
  description:
    'List of page URLs to exclude from auto tracking. When provided, tracking will be blocked on these URLs. Both full URLs and regex are supported. This takes precedence over pageUrlAllowlist.',
};

const dataAttributePrefix = {
  key: 'dataAttributePrefix',
  label: 'Data attribute prefix',
  type: 'string',
  hint: "default: 'data-amp-track-'",
  description: 'Prefix for data attributes to allow auto collecting.',
};

export const AUTOCAPTURE_OPTIONS = [
  {
    key: 'attribution',
    label: 'Attribution',
    defaultValue: true,
    description: 'Enables/disables marketing attribution tracking or config with detailed attribution options.',
    subOptions: [
      {
        key: 'excludeReferrers',
        label: 'Exclude referrers',
        type: 'regexList',
        hint: 'default: your own domain',
        description:
          'The rules to determine which referrers are excluded from being tracked as traffic source. Applies only to userProperty tracking; ignored by eventProperty tracking.',
      },
      {
        key: 'excludeInternalReferrers',
        label: 'Exclude internal referrers',
        type: 'boolean',
        defaultValue: false,
        description:
          "Exclude internal referrers from campaign attribution (a referrer is 'internal' if it is on the same domain as the current page). Applies only to userProperty tracking; ignored by eventProperty tracking.",
      },
      {
        key: 'initialEmptyValue',
        label: 'Initial empty value',
        type: 'string',
        hint: "default: 'EMPTY'",
        description:
          'The value to represent undefined/no initial campaign parameter for first-touch attribution. Applies only to userProperty tracking; ignored by eventProperty tracking.',
      },
      {
        key: 'resetSessionOnNewCampaign',
        label: 'Reset session on new campaign',
        type: 'boolean',
        defaultValue: false,
        description:
          'The flag of if Amplitude to start a new session if any campaign parameter changes. Applies only to userProperty tracking; ignored by eventProperty tracking.',
      },
      {
        key: 'trackingMethod',
        label: 'Tracking method',
        type: 'enum',
        hint: 'default: both',
        description:
          "The attribution persistence strategy for campaign parameters. Provide a single method to enable one strategy, or an array to enable multiple methods at the same time. For example, ['userProperty', 'eventProperty'] updates user properties and also attaches campaign params to event properties.",
        choices: [
          { value: 'userProperty', label: 'userProperty' },
          { value: 'eventProperty', label: 'eventProperty' },
          { value: 'both', label: 'both', runtime: ['userProperty', 'eventProperty'] },
        ],
      },
      {
        key: 'fallbackAttributionEvent',
        label: 'Fallback attribution event',
        type: 'boolean',
        defaultValue: false,
        description:
          'Fires an [Amplitude] Attribution event as a heartbeat on every page view, such as on page load and SPA URL changes. Applies only to eventProperty tracking; ignored by userProperty tracking.',
      },
    ],
  },
  {
    key: 'fileDownloads',
    label: 'File downloads',
    defaultValue: true,
    description: 'Enables/disables file downloads tracking.',
  },
  {
    key: 'formInteractions',
    label: 'Form interactions',
    defaultValue: true,
    description: 'Enables/disables form interaction tracking or configures with detailed options.',
  },
  {
    key: 'pageViews',
    label: 'Page views',
    defaultValue: true,
    description: 'Enables/disables default page view tracking.',
    subOptions: [
      {
        key: 'trackOn',
        label: 'Track on',
        type: 'enum',
        hint: 'default: every page load',
        description:
          "When to track a page view. Set to 'attribution' to only track page views that carry campaign parameters.",
        choices: [{ value: 'attribution', label: 'attribution' }],
      },
      {
        key: 'trackHistoryChanges',
        label: 'Track history changes',
        type: 'enum',
        hint: 'default: all',
        description:
          "Which History API changes count as a new page view: 'all' for any URL change, 'pathOnly' to ignore query and hash changes.",
        choices: [
          { value: 'all', label: 'all' },
          { value: 'pathOnly', label: 'pathOnly' },
        ],
      },
      {
        key: 'eventType',
        label: 'Event type',
        type: 'string',
        hint: "default: '[Amplitude] Page Viewed'",
        description: 'The event type used for the tracked page view event.',
      },
      {
        key: 'pageCounter',
        label: 'Page counter',
        type: 'number',
        hint: 'default: unset',
        description:
          "User's Nth instance of performing a default Page Viewed event within a session. Used for landing page analysis.",
      },
    ],
  },
  {
    key: 'sessions',
    label: 'Sessions',
    defaultValue: true,
    description: 'Enables/disables session tracking.',
  },
  {
    key: 'elementInteractions',
    label: 'Element interactions',
    defaultValue: false,
    description: 'Enables/disables user interactions tracking.',
    subOptions: [
      {
        key: 'cssSelectorAllowlist',
        label: 'CSS selector allowlist',
        type: 'stringList',
        hint: 'default: a, button, input, select, textarea, label, …',
        description:
          'List of CSS selectors to allow auto tracking on. When provided, allow elements matching any selector to be tracked.',
      },
      {
        key: 'actionClickAllowlist',
        label: 'Action click allowlist',
        type: 'stringList',
        hint: 'default: none',
        description:
          'CSS selector allowlist for tracking clicks that result in a DOM change/navigation on elements not already allowed by the cssSelectorAllowlist. Only applies to click-based interaction tracking; has no effect on viewport/exposure-based features.',
      },
      pageUrlAllowlist,
      pageUrlExcludelist,
      dataAttributePrefix,
    ],
  },
  {
    key: 'frustrationInteractions',
    label: 'Frustration interactions',
    defaultValue: false,
    description: 'Enables/disables frustration interactions tracking.',
    subOptions: [
      {
        key: 'deadClicks',
        label: 'Dead clicks',
        type: 'boolean',
        defaultValue: false,
        description:
          'Configuration for dead clicks tracking. Set to false to disable dead click tracking. Set to true or an options object to enable with default or custom settings.',
      },
      {
        key: 'rageClicks',
        label: 'Rage clicks',
        type: 'boolean',
        defaultValue: false,
        description:
          'Configuration for rage clicks tracking. Set to false to disable rage click tracking. Set to true or an options object to enable with default settings.',
      },
      pageUrlAllowlist,
      pageUrlExcludelist,
      dataAttributePrefix,
    ],
  },
  {
    key: 'networkTracking',
    label: 'Network tracking',
    defaultValue: false,
    description: 'Enables/disables network request tracking or config with detailed network tracking options.',
    subOptions: [
      {
        key: 'ignoreAmplitudeRequests',
        label: 'Ignore Amplitude requests',
        type: 'boolean',
        defaultValue: true,
        description: 'Suppresses tracking Amplitude requests from network capture.',
      },
      {
        key: 'ignoreHosts',
        label: 'Ignore hosts',
        type: 'stringList',
        hint: 'default: none · supports wildcards',
        description: 'Hosts to ignore for network capture. Supports wildcard.',
      },
      {
        key: 'captureRules',
        label: 'Capture rules',
        type: 'ruleList',
        description:
          'Rules to determine which network requests should be captured. Performs matching on array in reverse order.',
        fields: CAPTURE_RULE_FIELDS,
      },
    ],
  },
  {
    key: 'webVitals',
    label: 'Web vitals',
    defaultValue: false,
    description: 'Enables/disables web vitals tracking.',
  },
  {
    key: 'performanceTracking',
    label: 'Performance tracking',
    defaultValue: false,
    description: 'Enables/disables performance tracking.',
    subOptions: [
      {
        key: 'mainThreadBlock',
        label: 'Main thread block',
        type: 'boolean',
        defaultValue: false,
        description:
          'Configuration for main thread block tracking. Uses the Long Animation Frames API where available, falling back to Long Tasks. Set to false to disable tracking. Set to true or an options object to enable with default or custom settings.',
      },
      pageUrlAllowlist,
      pageUrlExcludelist,
    ],
  },
  {
    key: 'pageUrlEnrichment',
    label: 'Page URL enrichment',
    defaultValue: true,
    experimental: true,
    description: 'Enables/disables page url enrichment.',
  },
];

export function createDefaultAutocaptureOptions() {
  return Object.fromEntries(AUTOCAPTURE_OPTIONS.map((option) => [option.key, option.defaultValue]));
}

export function createDefaultSubOptions() {
  return Object.fromEntries(
    AUTOCAPTURE_OPTIONS.map((option) => [option.key, createDefaultValues(option.subOptions ?? [])]),
  );
}
