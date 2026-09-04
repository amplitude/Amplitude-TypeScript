// The options the Guides and Surveys plugin accepts, from InitOptions in @amplitude/engagement-browser
// (index.d.ts of the installed package, pinned by packages/unified). Each `description` is the JSDoc
// from the corresponding property and each `hint` its @default.
//
// The plugin fills several of these in from the analytics config it is added to — `init(config.apiKey,
// { serverZone: config.serverZone, ...options, options: { logLevel: config.logLevel, logger:
// config.loggerProvider, ...options.options } })` — so anything left unset here follows the analytics
// SDK rather than the standalone default.
//
// Deliberately not exposed:
//   - shared with the other SDKs: serverZone (initAll takes it at the top level, and the plugin reads
//     it off the analytics config)
//   - driven by the section's Enabled checkbox: skip
//   - class instances a form can't build: options.logger
//   - callbacks a form can't build: the function form of token (the string form is offered)
//   - the open-ended index signature on `options`
export const ENGAGEMENT_SECTIONS = [
  {
    title: 'General',
    fields: [
      {
        key: 'locale',
        label: 'Locale',
        type: 'string',
        hint: 'default: unset — uses the default language',
        description: 'Sets the locale for localization.',
      },
      {
        key: 'autoRefreshIntervalSeconds',
        label: 'Auto-refresh interval (s)',
        type: 'number',
        hint: 'default: disabled · minimum 60',
        description:
          'Auto-refresh interval in seconds. If not specified, 0, or negative, auto-refresh is disabled. When enabled, the SDK will automatically refresh (re-fetch targeting, user interaction state, and reload guides and surveys configuration) at this interval. Must be greater than or equal to 60 seconds.',
      },
      {
        key: 'token',
        label: 'Token',
        type: 'string',
        hint: 'default: unset',
        description:
          "JWT token for identity verification. Included in the user object sent to the server. The token should be an HS256-signed JWT containing the user's user_id, generated server-side using your project's secret key.",
      },
      {
        key: 'nonce',
        label: 'Nonce',
        type: 'string',
        hint: 'default: unset',
        description:
          'Sets a nonce value for Content Security Policy (CSP) compliance. This allows inline styles required by Guides and Surveys to be executed when CSP is enabled.',
      },
    ],
  },
  {
    title: 'Rendering & logging',
    fields: [
      {
        key: 'options',
        label: 'Options',
        type: 'group',
        description: 'Rendering, loading and logging behaviour of the Guides and Surveys bundle.',
        fields: [
          {
            key: 'splitting',
            label: 'Splitting',
            type: 'boolean',
            defaultValue: true,
            description: 'Enables code splitting for faster initial load times.',
          },
          {
            key: 'headless',
            label: 'Headless',
            type: 'boolean',
            defaultValue: false,
            description: 'Enables headless mode for custom rendering.',
          },
          {
            key: 'renderCssInDom',
            label: 'Render CSS in DOM',
            type: 'boolean',
            defaultValue: false,
            description: 'Renders CSS styles directly in the DOM instead of using CSS-in-JS.',
          },
          {
            key: 'persistResourceCenter',
            label: 'Persist Resource Center',
            type: 'boolean',
            defaultValue: false,
            description: 'Persists Resource Center state across sessions.',
          },
          {
            key: 'mountElementId',
            label: 'Mount element ID',
            type: 'string',
            hint: 'default: unset',
            description: 'Custom DOM element ID where the SDK should mount its container.',
          },
          {
            key: 'logLevel',
            label: 'Log level',
            type: 'enum',
            hint: 'default: the analytics log level',
            description: 'Sets the log level.',
            choices: [
              { value: '0', label: '0 — None', runtime: 0 },
              { value: '1', label: '1 — Error', runtime: 1 },
              { value: '2', label: '2 — Warn', runtime: 2 },
              { value: '3', label: '3 — Verbose', runtime: 3 },
              { value: '4', label: '4 — Debug', runtime: 4 },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Server URLs',
    fields: [
      {
        key: 'useEngagementDomain',
        label: 'Use engagement domain',
        type: 'boolean',
        defaultValue: false,
        description:
          'Uses the amplitudeengagement.com domain for all API, chat, media, and CDN requests instead of the default amplitude.com domain. Only supported in prod US and prod EU. Explicit serverUrl, chatUrl, mediaUrl, or cdnUrl values take precedence.',
      },
      {
        key: 'serverUrl',
        label: 'Server URL',
        type: 'string',
        hint: 'default: Amplitude endpoint for the zone',
        description: 'Sets a custom server URL for API requests. Useful for proxy setups.',
      },
      {
        key: 'chatUrl',
        label: 'Chat URL',
        type: 'string',
        hint: 'default: Amplitude endpoint for the zone',
        description: 'Sets a custom URL for chat functionality.',
      },
      {
        key: 'mediaUrl',
        label: 'Media URL',
        type: 'string',
        hint: 'default: Amplitude endpoint for the zone',
        description:
          'Sets a custom URL for proxying guide and survey images. Useful for proxy setups when images are blocked.',
      },
      {
        key: 'cdnUrl',
        label: 'CDN URL',
        type: 'string',
        hint: 'default: Amplitude CDN for the zone',
        description: 'Sets a custom CDN URL for static assets. Useful for proxy setups.',
      },
    ],
  },
];

export const ENGAGEMENT_OPTIONS = ENGAGEMENT_SECTIONS.flatMap((section) => section.fields);
