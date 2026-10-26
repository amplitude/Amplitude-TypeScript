// The rest of ExternalBrowserConfig (packages/analytics-core/src/types/config/browser-config.ts) and
// the IConfig it extends, minus `autocapture` which has its own panel. Defaults come from the
// BrowserConfig constructor in packages/analytics-browser/src/config.ts, and each `description` is
// the JSDoc from the corresponding interface property (used as the field's tooltip).
//
// Deliberately not exposed:
//   - set elsewhere in this UI: apiKey, autocapture
//   - hidden from BrowserOptions: transportProvider, requestMetadata
//   - class instances a form can't build: loggerProvider, storageProvider, identify
//   - Amplitude-internal: plan, ingestionMetadata
//   - deprecated: defaultTracking (use autocapture), fetchRemoteConfig (use remoteConfig.fetchRemoteConfig),
//     networkTrackingOptions (use autocapture.networkTracking)
//   - `transport` is offered as its TransportType string; the TransportOptions object form
//     (headers/enableKeepalive/referrerPolicy) is not exposed
//   - `customEnrichment` is offered as a boolean; its object form takes a `body` of JS source
export const CONFIG_SECTIONS = [
  {
    title: 'Identity',
    fields: [
      {
        key: 'userId',
        label: 'User ID',
        type: 'string',
        hint: 'default: unset',
        description:
          'The identifier for the user being tracked. This should be unique for each user and not hardcoded.',
      },
      {
        key: 'deviceId',
        label: 'Device ID',
        type: 'string',
        hint: 'default: random UUID',
        description:
          'The identifier for the device running your application. This should be unique for each device and not hardcoded.',
      },
      {
        key: 'sessionId',
        label: 'Session ID',
        type: 'number',
        hint: 'default: current timestamp',
        description:
          'The custom Session ID for the current session. This should be unique for each session and not hardcoded.',
      },
      {
        key: 'instanceName',
        label: 'Instance name',
        type: 'string',
        topLevel: 'shared',
        hint: "default: '$default'",
        description: 'The instance name. For tracking events to multiple Amplitude projects in your application.',
      },
      {
        key: 'partnerId',
        label: 'Partner ID',
        type: 'string',
        hint: 'default: unset',
        description:
          'The partner identifier. Amplitude requires the customer who built an event ingestion integration to add the partner identifier to partner_id.',
      },
      {
        key: 'appVersion',
        label: 'App version',
        type: 'string',
        hint: 'default: unset',
        description: 'An app version for events tracked. This can be the version of your application.',
      },
      {
        key: 'minIdLength',
        label: 'Min ID length',
        type: 'number',
        hint: 'default: 5',
        description: 'The minimum length for the value of userId and deviceId properties.',
      },
    ],
  },
  {
    title: 'Session & page',
    fields: [
      {
        key: 'sessionTimeout',
        label: 'Session timeout (ms)',
        type: 'number',
        hint: 'default: 1800000 (30 min)',
        description: 'The period of inactivity from the last tracked event before a session expires in milliseconds.',
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
    title: 'Server & transport',
    fields: [
      {
        key: 'serverZone',
        label: 'Server zone',
        type: 'enum',
        topLevel: 'shared',
        hint: "default: 'US'",
        description: 'The Amplitude server zone. Set this to EU for Amplitude projects created in EU data center.',
        choices: [
          { value: 'US', label: 'US' },
          { value: 'EU', label: 'EU' },
        ],
      },
      {
        key: 'serverUrl',
        label: 'Server URL',
        type: 'string',
        hint: 'default: Amplitude endpoint for the zone',
        description: 'The URL where events are upload to.',
      },
      {
        key: 'transport',
        label: 'Transport',
        type: 'enum',
        hint: "default: 'fetch'",
        description: 'Network transport mechanism used to send events.',
        choices: [
          { value: 'fetch', label: 'fetch' },
          { value: 'xhr', label: 'xhr' },
          { value: 'beacon', label: 'beacon' },
        ],
      },
      {
        key: 'useBatch',
        label: 'Use batch API',
        type: 'boolean',
        defaultValue: false,
        description: 'The flag of whether to upload events to Batch API instead of the default HTTP V2 API.',
      },
      {
        key: 'enableRequestBodyCompression',
        label: 'Compress request body',
        type: 'boolean',
        defaultValue: false,
        description:
          'Compress network request body payloads with gzip. For custom serverUrl values, this option controls whether compression is attempted. For default Amplitude endpoints, compression remains enabled. Compression is best-effort and only applies when the platform supports it, the payload meets the minimum size threshold, and the transport can set request headers.',
      },
      {
        key: 'offline',
        label: 'Offline',
        type: 'boolean',
        defaultValue: false,
        description: 'Whether the SDK is connected to network.',
      },
    ],
  },
  {
    title: 'Event flushing',
    fields: [
      {
        key: 'flushIntervalMillis',
        label: 'Flush interval (ms)',
        type: 'number',
        hint: 'default: 1000',
        description: 'The interval of uploading events to Amplitude in milliseconds.',
      },
      {
        key: 'flushMaxRetries',
        label: 'Flush max retries',
        type: 'number',
        hint: 'default: 5',
        description:
          'The maximum number of retries for failed upload attempts. This is only applicable to retryable errors.',
      },
      {
        key: 'flushQueueSize',
        label: 'Flush queue size',
        type: 'number',
        hint: 'default: 30',
        description: 'The maximum number of events that are batched in a single upload attempt.',
      },
    ],
  },
  {
    title: 'Logging & diagnostics',
    fields: [
      {
        key: 'logLevel',
        label: 'Log level',
        type: 'enum',
        hint: 'default: 2 (Warn)',
        description:
          'Level of logs to be printed in the developer console. Valid values are LogLevel.None, LogLevel.Error, LogLevel.Warn, LogLevel.Verbose, LogLevel.Debug.',
        choices: [
          { value: '0', label: '0 — None', runtime: 0 },
          { value: '1', label: '1 — Error', runtime: 1 },
          { value: '2', label: '2 — Warn', runtime: 2 },
          { value: '3', label: '3 — Verbose', runtime: 3 },
          { value: '4', label: '4 — Debug', runtime: 4 },
        ],
      },
      {
        key: 'enableDiagnostics',
        label: 'Enable diagnostics',
        type: 'boolean',
        defaultValue: true,
        description: 'Whether to enable diagnostics.',
      },
      {
        key: 'optOut',
        label: 'Opt out',
        type: 'boolean',
        topLevel: true,
        defaultValue: false,
        description:
          'The flag to opt this device out of Amplitude tracking. If this flag is set, no additional information will be stored for the user.',
      },
    ],
  },
  {
    title: 'Storage',
    fields: [
      {
        key: 'identityStorage',
        label: 'Identity storage',
        type: 'enum',
        hint: "default: 'cookie'",
        description: 'The storage for user identify.',
        choices: [
          { value: 'cookie', label: 'cookie' },
          { value: 'localStorage', label: 'localStorage' },
          { value: 'sessionStorage', label: 'sessionStorage' },
          { value: 'none', label: 'none' },
        ],
      },
      {
        key: 'cookieOptions',
        label: 'Cookie options',
        type: 'group',
        description: 'Configuration for cookie.',
        fields: [
          {
            key: 'domain',
            label: 'Domain',
            type: 'string',
            hint: 'default: your top level domain',
            description: 'The domain property of cookies created.',
          },
          {
            key: 'expiration',
            label: 'Expiration (days)',
            type: 'number',
            hint: 'default: 365',
            description: 'The expiration of cookies created in days.',
          },
          {
            key: 'sameSite',
            label: 'Same site',
            type: 'enum',
            hint: "default: 'Lax'",
            description: 'How cookies are sent with cross-site requests.',
            choices: [
              { value: 'Strict', label: 'Strict' },
              { value: 'Lax', label: 'Lax' },
              { value: 'None', label: 'None' },
            ],
          },
          {
            key: 'secure',
            label: 'Secure',
            type: 'boolean',
            defaultValue: false,
            description: 'The flag of if send cookies over secure protocols.',
          },
          {
            key: 'upgrade',
            label: 'Upgrade',
            type: 'boolean',
            defaultValue: true,
            description: 'The flag of if upgrade the cookies created by maintenance Browser SDK.',
          },
        ],
      },
    ],
  },
  {
    title: 'Tracking & remote config',
    fields: [
      {
        key: 'trackingOptions',
        label: 'Tracking options',
        type: 'group',
        description: 'The configurations for tracking additional properties.',
        fields: [
          {
            key: 'ipAddress',
            label: 'IP address',
            type: 'boolean',
            defaultValue: true,
            description: 'Enables/disables ip address tracking.',
          },
          {
            key: 'language',
            label: 'Language',
            type: 'boolean',
            defaultValue: true,
            description: 'Enables/disables language tracking.',
          },
          {
            key: 'platform',
            label: 'Platform',
            type: 'boolean',
            defaultValue: true,
            description: 'Enables/disables platform tracking.',
          },
        ],
      },
      {
        key: 'remoteConfig',
        label: 'Remote config',
        type: 'group',
        description: 'Remote configuration options.',
        fields: [
          {
            key: 'fetchRemoteConfig',
            label: 'Fetch remote config',
            type: 'boolean',
            defaultValue: true,
            description:
              'Whether to fetch remote configuration. The remote configuration can be updated in the Amplitude platform under Settings > Autocapture.',
          },
          {
            key: 'serverUrl',
            label: 'Server URL',
            type: 'string',
            hint: 'default: Amplitude remote config endpoint',
            description:
              'Custom server URL for remote configuration requests. If not provided, defaults to the standard Amplitude remote config endpoint based on serverZone (US or EU). Use this to proxy remote config requests through your own server.',
          },
        ],
      },
      {
        key: 'customEnrichment',
        label: 'Custom enrichment',
        type: 'boolean',
        defaultValue: false,
        hint: '(experimental · boolean form only)',
        description: 'The configurations for custom enrichment.',
      },
    ],
  },
];

export const CONFIG_OPTIONS = CONFIG_SECTIONS.flatMap((section) => section.fields);

// Promoted options. They stay in their section above so the schema, defaults and snippet
// serialization keep treating them like any other field; only the rendering moves.
//
// `topLevel: 'shared'` marks the options initAll() takes at the top level of its config rather than
// under `analytics`, because every SDK it initialises gets them (UnifiedSharedOptions in
// packages/unified/src/unified.ts). They aren't analytics-specific, so they render next to the API
// key, above the per-SDK sections. `topLevel: true` is for options that are analytics-only but
// common enough to be worth reaching without opening a panel.
export const SHARED_CONFIG_OPTIONS = CONFIG_OPTIONS.filter((field) => field.topLevel === 'shared');
export const TOP_LEVEL_CONFIG_OPTIONS = CONFIG_OPTIONS.filter((field) => field.topLevel === true);
