import { AUTOCAPTURE_OPTIONS, CAPTURE_RULE_FIELDS } from './autocapture-options.js';
import { CONFIG_OPTIONS, SHARED_CONFIG_OPTIONS } from './config-options.js';
import { ENGAGEMENT_OPTIONS } from './engagement-options.js';
import { changedFields, parseList, parsePatterns } from './fields.js';
// The script loader users are told to paste into <head>, read straight from the artifact the release
// scripts generate so the pinned SDK version and its integrity hash always match this checkout.
import SNIPPET_LOADER from '../../packages/analytics-browser/generated/amplitude-snippet.js?raw';
import { SESSION_REPLAY_OPTIONS } from './session-replay-options.js';
// Versioned CDN bundle, named by packages/plugin-session-replay-browser/scripts/publish/upload-to-s3.js
// and read from the package so it tracks this checkout. Its IIFE build exposes `window.sessionReplay`.
import { version as sessionReplayPluginVersion } from '../../packages/plugin-session-replay-browser/package.json';

const SESSION_REPLAY_PLUGIN_URL = `https://cdn.amplitude.com/libs/plugin-session-replay-browser-${sessionReplayPluginVersion}-min.js.gz`;

// Stands in for the key so the code block is readable before anything is typed.
export const PLACEHOLDER_API_KEY = 'YOUR_API_KEY';

// The ways the same configuration can be handed to the SDK. `language` is the Prism grammar the
// generated code is highlighted with.
export const SNIPPET_FORMATS = [
  { value: 'esm', label: 'ESM', language: 'javascript' },
  { value: 'snippet', label: 'Browser Snippet', language: 'html' },
  { value: 'unified', label: 'Unified SDK', language: 'javascript' },
];

export function snippetLanguage(format) {
  return SNIPPET_FORMATS.find((candidate) => candidate.value === format)?.language ?? 'javascript';
}

function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// Both formatters take the indent of their own closing brace/bracket; contents sit two deeper.
function formatObject(entries, closingIndent) {
  const lines = entries.map(([key, literal]) => `${closingIndent}  ${key}: ${literal},`).join('\n');
  return `{\n${lines}\n${closingIndent}}`;
}

function formatArray(literals, closingIndent) {
  const lines = literals.map((literal) => `${closingIndent}  ${literal},`).join('\n');
  return `[\n${lines}\n${closingIndent}]`;
}

function formatStringList(value) {
  return `[${parseList(value).map(quote).join(', ')}]`;
}

// Patterns are written bare (`\.example\.com$`), but an already-delimited literal with flags is left
// alone so a pattern needing /i can still be expressed.
function toRegexLiteral(pattern) {
  if (/^\/.*\/[dgimsuvy]*$/.test(pattern)) {
    return pattern;
  }
  return `/${pattern.replace(/(?<!\\)\//g, '\\/')}/`;
}

// The exact values first, then the patterns as regex literals, matching how the SDK's own remote
// config merges its `<option>Regex` companions onto the end of the exact list.
function regexListLiterals(value = {}) {
  return [...parseList(value.list).map(quote), ...parsePatterns(value.regexes).map(toRegexLiteral)];
}

// `string[] | boolean`: an explicit boolean, or a custom header list.
function serializeHeaders(value = {}) {
  if (value.mode === 'true' || value.mode === 'false') {
    return value.mode;
  }
  if (value.mode === 'custom' && parseList(value.list).length > 0) {
    return formatStringList(value.list);
  }
  return null;
}

function serializeBodyRule(value = {}, closingIndent) {
  const entries = ['allowlist', 'excludelist']
    .filter((key) => parseList(value[key] ?? '').length > 0)
    .map((key) => [key, formatStringList(value[key])]);
  return entries.length > 0 ? formatObject(entries, closingIndent) : null;
}

// Returns null for anything the user left alone, so untouched fields stay out of the snippet.
function serializeRuleField(field, value, closingIndent) {
  switch (field.type) {
    case 'headers':
      return serializeHeaders(value);
    case 'bodyRule':
      return serializeBodyRule(value, closingIndent);
    case 'stringList':
      return parseList(value).length > 0 ? formatStringList(value) : null;
    case 'regexList': {
      const literals = regexListLiterals(value);
      return literals.length > 0 ? `[${literals.join(', ')}]` : null;
    }
    default:
      return String(value ?? '').trim() !== '' ? quote(String(value).trim()) : null;
  }
}

function serializeRule(rule, closingIndent) {
  const entries = CAPTURE_RULE_FIELDS.map((field) => [
    field.key,
    serializeRuleField(field, rule[field.key], `${closingIndent}  `),
  ]).filter(([, literal]) => literal !== null);
  return entries.length > 0 ? formatObject(entries, closingIndent) : '{}';
}

// A choice carries `runtime` when the value the SDK wants isn't the string the select holds: a numeric
// log level, or the pair of strings behind `trackingMethod: both`.
function formatEnumValue(field, value) {
  const { runtime } = field.choices.find((choice) => choice.value === value) ?? {};
  if (runtime === undefined) {
    return quote(value);
  }
  if (Array.isArray(runtime)) {
    return `[${runtime.map(quote).join(', ')}]`;
  }
  return typeof runtime === 'number' ? String(runtime) : quote(runtime);
}

function serializeField(field, value, closingIndent) {
  switch (field.type) {
    case 'boolean':
      return String(value);
    case 'number':
      return String(Number(value));
    case 'stringList':
      return formatStringList(value);
    case 'regexList':
      return `[${regexListLiterals(value).join(', ')}]`;
    case 'ruleList':
      return formatArray(
        value.map((rule) => serializeRule(rule, `${closingIndent}  `)),
        closingIndent,
      );
    case 'group':
      return serializeFieldSet(field.fields, value, closingIndent, field.requiredKeys);
    case 'enum':
      return formatEnumValue(field, value);
    default:
      return quote(value);
  }
}

// `requiredKeys` are non-optional on the type they describe, so once anything else in the object is
// emitted they have to be emitted too, at their default, or the object wouldn't type-check.
function serializeFieldSet(fields, values = {}, closingIndent, requiredKeys = []) {
  const changed = changedFields(fields, values);
  const emitted = fields.filter((field) => changed.includes(field) || requiredKeys.includes(field.key));
  const entries = emitted.map((field) => [field.key, serializeField(field, values[field.key], `${closingIndent}  `)]);
  return formatObject(entries, closingIndent);
}

// Disabled -> `false`. Enabled with nothing customised -> `true`. Enabled with customised
// sub-options -> an object holding just those.
function serializeAutocaptureOption(option, enabled, subValues, closingIndent) {
  if (!enabled) {
    return 'false';
  }
  if (changedFields(option.subOptions ?? [], subValues).length === 0) {
    return 'true';
  }
  return serializeFieldSet(option.subOptions, subValues, closingIndent);
}

// `indent` is where the enclosing object's closing brace sits, so entries land one level deeper.
function configEntries(configOptions, indent, includeKey = () => true) {
  return changedFields(CONFIG_OPTIONS, configOptions)
    .filter((field) => includeKey(field.key))
    .map((field) => [field.key, serializeField(field, configOptions[field.key], `${indent}  `)]);
}

function autocaptureEntry({ autocapture, autocaptureOptions, autocaptureSubOptions }, indent) {
  if (!autocapture) {
    return ['autocapture', 'false'];
  }
  const entries = AUTOCAPTURE_OPTIONS.map((option) => [
    option.key,
    serializeAutocaptureOption(
      option,
      autocaptureOptions[option.key],
      autocaptureSubOptions[option.key],
      `${indent}    `,
    ),
  ]);
  return ['autocapture', formatObject(entries, `${indent}  `)];
}

// initAll() spreads its shared options over the analytics ones, so one of these nested under
// `analytics` would be overwritten with undefined. They have to be hoisted. This is the same set the
// form renders above the per-blade sections.
const UNIFIED_SHARED_KEYS = SHARED_CONFIG_OPTIONS.map((field) => field.key);

function unifiedEntries(state) {
  const analytics = [
    ...configEntries(state.configOptions, '  ', (key) => !UNIFIED_SHARED_KEYS.includes(key)),
    autocaptureEntry(state, '  '),
  ];
  return [
    ...configEntries(state.configOptions, '', (key) => UNIFIED_SHARED_KEYS.includes(key)),
    ['analytics', formatObject(analytics, '  ')],
  ];
}

// Session replay and Guides and Surveys are plugins rather than config keys, so each format installs
// them differently, but the options object they take is built the same way.
function pluginEntries(fields, values, indent) {
  return changedFields(fields, values).map((field) => [
    field.key,
    serializeField(field, values[field.key], `${indent}  `),
  ]);
}

// A plugin with nothing customised is still worth emitting: the bare call is what tells the reader
// the product is wired up at all.
function pluginCall(fields, values, factory, indent) {
  const entries = pluginEntries(fields, values, indent);
  return entries.length > 0 ? `${factory}(${formatObject(entries, indent)})` : `${factory}()`;
}

// Guides and Surveys is served per project rather than per version, so the script tag carries the API
// key: https://amplitude.com/docs/sdks/guides-and-surveys/sdk.
function engagementScriptUrl(apiKey) {
  return `https://cdn.amplitude.com/script/${apiKey}.engagement.js`;
}

function indentBlock(text, indent) {
  return text
    .trim()
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `${indent}${line}`))
    .join('\n');
}

export function buildSnippet({
  apiKey,
  format = 'esm',
  configOptions = {},
  autocapture,
  autocaptureOptions = {},
  autocaptureSubOptions = {},
  sessionReplay,
  sessionReplayOptions = {},
  engagement,
  engagementOptions = {},
}) {
  const state = { configOptions, autocapture, autocaptureOptions, autocaptureSubOptions };
  const rawApiKey = apiKey.trim() || PLACEHOLDER_API_KEY;
  const key = quote(rawApiKey);

  if (format === 'unified') {
    const entries = unifiedEntries(state);
    // initAll() installs both plugins itself, so these keys only customise them, and are left out
    // entirely when there is nothing to customise. Guides and Surveys is the one that has to be
    // spelled out when switched off, since `skip` is how a unified setup opts out of it.
    if (sessionReplay) {
      const replay = pluginEntries(SESSION_REPLAY_OPTIONS, sessionReplayOptions, '  ');
      if (replay.length > 0) {
        entries.push(['sessionReplay', formatObject(replay, '  ')]);
      }
    }
    const guides = engagement ? pluginEntries(ENGAGEMENT_OPTIONS, engagementOptions, '  ') : [['skip', 'true']];
    if (guides.length > 0) {
      entries.push(['engagement', formatObject(guides, '  ')]);
    }
    return `import { initAll } from '@amplitude/unified';

initAll(${key}, ${formatObject(entries, '')});`;
  }

  if (format === 'snippet') {
    const entries = [...configEntries(state.configOptions, '    '), autocaptureEntry(state, '    ')];
    // Each plugin bundle is a separate blocking script so its global is defined by the time the next
    // inline script runs. amplitude.add() is queued by the loader either way.
    const replay = sessionReplay
      ? `
  <script src="${SESSION_REPLAY_PLUGIN_URL}"></script>
  <script type="text/javascript">
    amplitude.add(${pluginCall(SESSION_REPLAY_OPTIONS, sessionReplayOptions, 'sessionReplay.plugin', '    ')});
  </script>`
      : '';
    const guides = engagement
      ? `
  <script src="${engagementScriptUrl(rawApiKey)}"></script>
  <script type="text/javascript">
    amplitude.add(${pluginCall(ENGAGEMENT_OPTIONS, engagementOptions, 'window.engagement.plugin', '    ')});
  </script>`
      : '';
    return `<head>
  <script type="text/javascript">
${indentBlock(SNIPPET_LOADER, '    ')}

    amplitude.init(${key}, ${formatObject(entries, '    ')});
  </script>${replay}${guides}
</head>`;
  }

  const entries = [...configEntries(state.configOptions, ''), autocaptureEntry(state, '')];
  const imports = [`import * as amplitude from '@amplitude/analytics-browser';`];
  const beforeInit = [];
  const afterInit = [];
  if (engagement) {
    imports.push(`import { plugin as engagementPlugin } from '@amplitude/engagement-browser';`);
    // Added before init() so the analytics SDK drives the plugin's setup with the user identity and
    // session already resolved, as its docs call for. Session replay's own README inits first.
    beforeInit.push(`amplitude.add(${pluginCall(ENGAGEMENT_OPTIONS, engagementOptions, 'engagementPlugin', '')});`);
  }
  if (sessionReplay) {
    imports.push(`import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';`);
    afterInit.push(
      `amplitude.add(${pluginCall(SESSION_REPLAY_OPTIONS, sessionReplayOptions, 'sessionReplayPlugin', '')});`,
    );
  }
  return [
    imports.join('\n'),
    '',
    ...beforeInit,
    `amplitude.init(${key}, ${formatObject(entries, '')});`,
    ...afterInit,
  ].join('\n');
}
