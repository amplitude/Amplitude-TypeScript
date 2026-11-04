// The options `sessionReplayPlugin()` accepts, from SessionReplayOptions in
// packages/plugin-session-replay-browser/src/typings/session-replay.ts. Most of those properties only
// carry an `@see` link, so the descriptions below come from the standalone type they point at,
// SessionReplayLocalConfig in packages/session-replay-browser/src/config/types.ts.
//
// Defaults are the runtime ones from packages/session-replay-browser/src/config/local-config.ts and
// constants.ts, which is not always what the plugin README's table says: SR-4646 moved storeType to
// 'memory', useWebWorker to true, mergeMutations to true, eagerFullSnapshotSend and
// captureFullSnapshotOnFocus to false, and minIntervalMs to 1000.
//
// Deliberately not exposed:
//   - callbacks a form can't build: customSessionId, handleSendEvents, handleFetchConfig
//   - deprecated: experimental (superseded by useWebWorker)
//   - repeatable object lists: interactionConfig.ugcFilterRules, privacyConfig.urlMaskLevels
//     (the latter isn't on the plugin's own type and isn't forwarded to the standalone SDK)
//   - supplied by the analytics SDK: sessionId, sessionReplayId, optOut, serverZone, version

// `enabled` is required on these nested types, so it is emitted whenever anything else in the group
// is, otherwise the generated object wouldn't type-check.
const performanceConfig = {
  key: 'performanceConfig',
  label: 'Performance config',
  type: 'group',
  requiredKeys: ['enabled'],
  description:
    "Performance configuration config. If enabled, we will defer compression to be done during the browser's idle periods.",
  fields: [
    {
      key: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      defaultValue: true,
      description: "If enabled, event compression will be deferred to occur during the browser's idle periods.",
    },
    {
      key: 'timeout',
      label: 'Timeout (ms)',
      type: 'number',
      hint: 'default: unset',
      description:
        'Optional timeout in milliseconds for the requestIdleCallback API. If specified, this value will be used to set a maximum time for the browser to wait before executing the deferred compression task, even if the browser is not idle.',
    },
    {
      key: 'mergeMutations',
      label: 'Merge mutations',
      type: 'boolean',
      defaultValue: true,
      description:
        'If enabled, consecutive mutation events are merged into a single event before compression. This reduces the stored event count and coalesces bursts of inline style mutations on the same node (last-write-wins), without changing replay semantics.',
    },
    {
      key: 'interaction',
      label: 'Interaction',
      type: 'group',
      description: 'Performance configuration for interaction tracking (clicks, scrolls).',
      fields: [
        {
          key: 'timeoutMs',
          label: 'Timeout (ms)',
          type: 'number',
          hint: 'default: no timeout',
          description:
            'Maximum time in milliseconds allowed for CSS selector generation. If selector generation takes longer than this, it will throw a timeout error.',
        },
        {
          key: 'maxNumberOfTries',
          label: 'Max number of tries',
          type: 'number',
          hint: 'default: 10000',
          description:
            'Maximum number of attempts to optimize/simplify the CSS selector path. Higher values may produce shorter selectors but take longer to compute.',
        },
        {
          key: 'threshold',
          label: 'Threshold',
          type: 'number',
          hint: 'default: 1000',
          description:
            'Maximum number of CSS selector combinations to test for uniqueness. If more combinations would be generated, falls back to a simpler strategy.',
        },
      ],
    },
  ],
};

export const SESSION_REPLAY_SECTIONS = [
  {
    title: 'Sampling & debugging',
    fields: [
      {
        key: 'sampleRate',
        label: 'Sample rate',
        type: 'number',
        topLevel: true,
        hint: 'default: 0 — nothing is recorded until you set this',
        description:
          'Use this option to control how many sessions to select for replay collection. The number should be a decimal between 0 and 1, for example 0.4, representing the fraction of sessions to have randomly selected for replay collection. Over a large number of sessions, 0.4 would select 40% of those sessions. Sample rates as small as six decimal places (0.000001) are supported.',
      },
      {
        key: 'debugMode',
        label: 'Debug mode',
        type: 'boolean',
        defaultValue: false,
        description:
          'Adds additional debug event property to help debug instrumentation issues (such as mismatching apps). Only recommended for debugging initial setup, and not recommended for production.',
      },
      {
        key: 'forceSessionTracking',
        label: 'Force session tracking',
        type: 'boolean',
        defaultValue: false,
        description: 'If this is enabled we will force the browser SDK to also send start and end session events.',
      },
      {
        key: 'deviceId',
        label: 'Device ID',
        type: 'string',
        hint: 'default: the analytics device ID',
        description: 'Override the device ID for session replay.',
      },
    ],
  },
  {
    title: 'Privacy',
    fields: [
      {
        key: 'privacyConfig',
        label: 'Privacy config',
        type: 'group',
        description: 'Supports advanced masking configs with CSS selectors.',
        fields: [
          {
            key: 'defaultMaskLevel',
            label: 'Default mask level',
            type: 'enum',
            hint: "default: 'medium'",
            description:
              'light masks only the subset of inputs deemed sensitive (password, credit card, telephone number, email) — information we never want to capture. medium masks all form fields (inputs); page text is captured as-is. conservative masks all inputs and all texts.',
            choices: [
              { value: 'light', label: 'light' },
              { value: 'medium', label: 'medium' },
              { value: 'conservative', label: 'conservative' },
            ],
          },
          {
            key: 'blockSelector',
            label: 'Block selector',
            type: 'stringList',
            hint: 'default: none · .amp-block always applies',
            description:
              'CSS selectors for elements to block from the replay entirely. A blocked element appears as a placeholder with the same dimensions.',
          },
          {
            key: 'maskSelector',
            label: 'Mask selector',
            type: 'stringList',
            hint: 'default: none · .amp-mask always applies',
            description:
              'CSS selectors for elements whose text, and their children’s text, is replaced with asterisks.',
          },
          {
            key: 'unmaskSelector',
            label: 'Unmask selector',
            type: 'stringList',
            hint: 'default: none · .amp-unmask is always added',
            description: 'CSS selectors for elements to leave unmasked, exempting them from the default mask level.',
          },
        ],
      },
    ],
  },
  {
    title: 'Performance & storage',
    fields: [
      performanceConfig,
      {
        key: 'storeType',
        label: 'Store type',
        type: 'enum',
        hint: "default: 'memory'",
        description:
          'Specifies how replay events should be stored. idb uses IndexedDB to persist replay events when all events cannot be sent during capture. memory stores replay events only in memory, meaning events are lost when the page is closed. If IndexedDB is unavailable, the system falls back to memory.',
        choices: [
          { value: 'idb', label: 'idb' },
          { value: 'memory', label: 'memory' },
        ],
      },
      {
        key: 'useWebWorker',
        label: 'Use web worker',
        type: 'boolean',
        defaultValue: true,
        description:
          'If true, the SDK will compress replay events using a web worker. This offloads compression to a separate thread, improving performance on the main thread. Set to false to keep compression on the main thread.',
      },
      {
        key: 'flushIntervalConfig',
        label: 'Flush interval config',
        type: 'group',
        description:
          'Bounds on the rrweb event-split interval. Lowering them buys replay availability latency improvements at the cost of more requests; raising them reduces request volume at the cost of slightly delayed replay availability.',
        fields: [
          {
            key: 'minIntervalMs',
            label: 'Min interval (ms)',
            type: 'number',
            hint: 'default: 1000',
            description:
              'Lower bound on the rrweb event-split interval in milliseconds. Also the increment added to the interval after each split. Must be > 0; values are clamped to a 100ms floor.',
          },
          {
            key: 'maxIntervalMs',
            label: 'Max interval (ms)',
            type: 'number',
            hint: 'default: 10000',
            description: 'Upper bound on the rrweb event-split interval in milliseconds. Must be >= minIntervalMs.',
          },
        ],
      },
      {
        key: 'maxPersistedEventsSizeBytes',
        label: 'Max persisted events size (bytes)',
        type: 'number',
        hint: 'default: 6000000 · advanced',
        description:
          'Raw (uncompressed) UTF-8 byte cap for a single buffered events list before the store splits it into its own request. Larger values produce fewer, larger requests (the primary steady-state lever for request volume); smaller values split sooner. Payloads are gzipped on the wire, so several hundred KB of replay JSON compresses to well under 100 KB. Advanced/debug knob — the default already balances request volume against the server’s decompressed-size split threshold. Clamped to a safe range.',
      },
      {
        key: 'maxSingleEventSizeBytes',
        label: 'Max single event size (bytes)',
        type: 'number',
        hint: 'default: 9000000 · advanced',
        description:
          'Raw (uncompressed) UTF-8 byte cap for a single rrweb event. Events larger than this are dropped (with a warning) both at capture time and as a pre-send backstop, because the SR ingest service rejects a single event above ~10 MB. Lower this to exercise drop behavior for large full snapshots while debugging. Clamped to a safe range.',
      },
      {
        key: 'sendTimeoutMs',
        label: 'Send timeout (ms)',
        type: 'number',
        hint: 'default: 10000 · 0 disables',
        description:
          'Milliseconds to wait for a send request before aborting it. fetch() has no native timeout, so a request stuck "pending" would block the serial flush loop indefinitely; the SDK aborts after this many ms and routes the abort as a retryable failure. Set to 0 (or a negative value) to disable the timeout entirely. Tuning this higher is useful when large, slow-but-succeeding uploads are being aborted at the default and counted as failures.',
      },
    ],
  },
  {
    title: 'Capture behavior',
    fields: [
      {
        key: 'shouldInlineStylesheet',
        label: 'Inline stylesheets',
        type: 'boolean',
        defaultValue: true,
        description:
          'If stylesheets are inlined, the contents of the stylesheet will be stored. During replay, the stored stylesheet will be used instead of attempting to fetch it remotely. This prevents replays from appearing broken due to missing stylesheets. Note: inlining stylesheets may not work in all cases.',
      },
      {
        key: 'captureAdoptedStyleSheets',
        label: 'Capture adopted stylesheets',
        type: 'boolean',
        defaultValue: true,
        description:
          'When true (default), the CSS rules of any adoptedStyleSheets on shadow roots and the document are serialized inline within the full snapshot. This makes the snapshot self-contained so that shadow DOM styles are replayed correctly even if subsequent incremental AdoptedStyleSheet events are dropped in transit. Set to false to revert to the legacy behavior where adopted stylesheet rules are emitted as separate incremental events.',
      },
      {
        key: 'captureDocumentTitle',
        label: 'Capture document title',
        type: 'boolean',
        defaultValue: false,
        description:
          'Whether to capture document title in URL change events. When disabled, the title field will be empty in URL change events.',
      },
      {
        key: 'applyBackgroundColorToBlockedElements',
        label: 'Background colour on blocked elements',
        type: 'boolean',
        defaultValue: false,
        description: 'If true, applies a background color to blocked elements for visual masking.',
      },
      {
        key: 'eagerFullSnapshotSend',
        label: 'Eager full snapshot send',
        type: 'boolean',
        defaultValue: false,
        description:
          'When true, every rrweb full snapshot is flushed to the server immediately so replays become playable as early as possible. When false (default), full-snapshot sends are deferred to the normal interval/size flush cadence instead. The snapshot is still compressed and buffered immediately either way; only the eager network send is suppressed.',
      },
      {
        key: 'captureFullSnapshotOnFocus',
        label: 'Full snapshot on focus',
        type: 'boolean',
        defaultValue: false,
        description:
          'When true, the window focus listener forces a fresh rrweb full snapshot every time the page regains focus, so the replay reflects any DOM changes that happened while the tab was backgrounded. When false (default), the on-focus full snapshot is skipped entirely. On pages with heavy focus churn this fires constantly, and combined with eagerFullSnapshotSend each focus produces an immediate network send.',
      },
      {
        key: 'enableUrlChangePolling',
        label: 'URL change polling',
        type: 'boolean',
        defaultValue: false,
        description:
          'Enables URL change polling as a fallback for SPA route tracking. When enabled, the SDK will periodically check for URL changes every second in addition to patching the History API. This is useful for edge cases where route changes might bypass the standard History API methods.',
      },
      {
        key: 'urlChangePollingInterval',
        label: 'URL change polling interval (ms)',
        type: 'number',
        hint: 'default: 1000',
        description:
          'Specifies the interval in milliseconds for URL change polling when enableUrlChangePolling is true. The SDK will check for URL changes at this interval as a fallback for SPA route tracking.',
      },
      {
        key: 'crossOriginIframes',
        label: 'Cross-origin iframes',
        type: 'group',
        requiredKeys: ['enabled'],
        description:
          'Enables recording of cross-origin iframes. Both the parent page and each child iframe page must load the Amplitude Session Replay SDK with this option enabled. When enabled, rrweb uses postMessage to relay child DOM events to the parent, which merges them into a single unified event stream.',
        fields: [
          { key: 'enabled', label: 'Enabled', type: 'boolean', defaultValue: false },
          {
            key: 'coordinateChildren',
            label: 'Coordinate children',
            type: 'boolean',
            defaultValue: true,
            description:
              'When true (default), the parent SDK sends start/stop signals to child iframes via postMessage, keeping their recording lifecycle in sync with the parent. Privacy note: the child page’s rrweb instance performs its own DOM serialization, so the parent’s privacy config does NOT automatically apply inside the iframe. Set to false to skip coordination and manage the child recording lifecycle yourself.',
          },
        ],
      },
      {
        key: 'interactionConfig',
        label: 'Interaction config',
        type: 'group',
        requiredKeys: ['enabled', 'batch'],
        description:
          'Interaction (click and scroll) capture. Normally driven by remote config; set it here to configure it locally.',
        fields: [
          { key: 'enabled', label: 'Enabled', type: 'boolean', defaultValue: false },
          { key: 'batch', label: 'Batch', type: 'boolean', defaultValue: false },
          {
            key: 'trackEveryNms',
            label: 'Track every (ms)',
            type: 'number',
            hint: 'default: 30000',
            description: 'How often interaction events are captured, in milliseconds.',
          },
        ],
      },
    ],
  },
  {
    title: 'Server URLs',
    fields: [
      {
        key: 'configServerUrl',
        label: 'Config server URL',
        type: 'string',
        hint: 'default: Amplitude endpoint for the zone',
        description:
          'Specifies the endpoint URL to fetch remote configuration. If provided, it overrides the default server zone configuration.',
      },
      {
        key: 'trackServerUrl',
        label: 'Track server URL',
        type: 'string',
        hint: 'default: Amplitude endpoint for the zone',
        description:
          'Specifies the endpoint URL for sending session replay data. If provided, it overrides the default server zone configuration.',
      },
    ],
  },
];

export const SESSION_REPLAY_OPTIONS = SESSION_REPLAY_SECTIONS.flatMap((section) => section.fields);

// Nothing is recorded until the sample rate is set, so it is rendered above the panels rather than
// inside one. It stays in its section above so defaults and snippet serialization are unaffected.
export const TOP_LEVEL_SESSION_REPLAY_OPTIONS = SESSION_REPLAY_OPTIONS.filter((field) => field.topLevel);
