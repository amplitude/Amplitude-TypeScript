// Turns the form state into the values the SDKs actually take, for the run page.
//
// This is the same walk snippet.js does, one step short of it: snippet.js renders each field as source
// text, this returns the value that source would evaluate to. The two are deliberately separate rather
// than the snippet being generated from these values, because the snippet also owns indentation and
// only it needs to worry about how a value reads. They have to agree, so a change to how a field type
// is interpreted belongs in both — the round-trip is covered by comparing the two.
import { AUTOCAPTURE_OPTIONS, CAPTURE_RULE_FIELDS } from './autocapture-options.js';
import { CONFIG_OPTIONS } from './config-options.js';
import { ENGAGEMENT_OPTIONS } from './engagement-options.js';
import { changedFields, parseList, parsePatterns } from './fields.js';
import { SESSION_REPLAY_OPTIONS } from './session-replay-options.js';

// Patterns are written bare (`\.example\.com$`), but an already-delimited literal with flags is
// honoured so a pattern needing /i still works.
function toRegExp(pattern) {
  const delimited = /^\/(.*)\/([dgimsuvy]*)$/.exec(pattern);
  return delimited ? new RegExp(delimited[1], delimited[2]) : new RegExp(pattern);
}

// The exact values first, then the patterns, matching how the SDK's own remote config merges its
// `<option>Regex` companions onto the end of the exact list.
function regexListValue(value = {}) {
  return [...parseList(value.list), ...parsePatterns(value.regexes).map(toRegExp)];
}

// A choice carries `runtime` when the value the SDK wants isn't the string the select holds.
function enumValue(field, value) {
  const { runtime } = field.choices.find((choice) => choice.value === value) ?? {};
  return runtime === undefined ? value : runtime;
}

// `string[] | boolean`: an explicit boolean, or a custom header list.
function headersValue(value = {}) {
  if (value.mode === 'true' || value.mode === 'false') {
    return value.mode === 'true';
  }
  if (value.mode === 'custom' && parseList(value.list).length > 0) {
    return parseList(value.list);
  }
  return undefined;
}

function bodyRuleValue(value = {}) {
  const entries = ['allowlist', 'excludelist']
    .filter((key) => parseList(value[key] ?? '').length > 0)
    .map((key) => [key, parseList(value[key])]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

// Returns undefined for anything the user left alone, so untouched fields stay off the object.
function ruleFieldValue(field, value) {
  switch (field.type) {
    case 'headers':
      return headersValue(value);
    case 'bodyRule':
      return bodyRuleValue(value);
    case 'stringList':
      return parseList(value).length > 0 ? parseList(value) : undefined;
    case 'regexList': {
      const merged = regexListValue(value);
      return merged.length > 0 ? merged : undefined;
    }
    default:
      return String(value ?? '').trim() !== '' ? String(value).trim() : undefined;
  }
}

function ruleValue(rule) {
  const entries = CAPTURE_RULE_FIELDS.map((field) => [field.key, ruleFieldValue(field, rule[field.key])]).filter(
    ([, value]) => value !== undefined,
  );
  return Object.fromEntries(entries);
}

function fieldValue(field, value) {
  switch (field.type) {
    case 'boolean':
      return value;
    case 'number':
      return Number(value);
    case 'stringList':
      return parseList(value);
    case 'regexList':
      return regexListValue(value);
    case 'ruleList':
      return value.map(ruleValue);
    case 'group':
      return fieldSetValue(field.fields, value, field.requiredKeys);
    case 'enum':
      return enumValue(field, value);
    default:
      return value;
  }
}

// `requiredKeys` are non-optional on the type they describe, so once anything else in the object is
// set they are carried along at their default.
function fieldSetValue(fields, values = {}, requiredKeys = []) {
  const changed = changedFields(fields, values);
  const included = fields.filter((field) => changed.includes(field) || requiredKeys.includes(field.key));
  return Object.fromEntries(included.map((field) => [field.key, fieldValue(field, values[field.key])]));
}

// Disabled -> false. Enabled with nothing customised -> true. Enabled with customised sub-options -> an
// object holding just those.
function autocaptureValue(option, enabled, subValues) {
  if (!enabled) {
    return false;
  }
  if (changedFields(option.subOptions ?? [], subValues).length === 0) {
    return true;
  }
  return fieldSetValue(option.subOptions, subValues);
}

function autocaptureConfig({ autocapture, autocaptureOptions, autocaptureSubOptions }) {
  if (!autocapture) {
    return false;
  }
  return Object.fromEntries(
    AUTOCAPTURE_OPTIONS.map((option) => [
      option.key,
      autocaptureValue(option, autocaptureOptions[option.key], autocaptureSubOptions[option.key]),
    ]),
  );
}

export function buildRuntimeConfig(state) {
  const analytics = fieldSetValue(CONFIG_OPTIONS, state.configOptions);
  return {
    apiKey: state.apiKey.trim(),
    analytics: { ...analytics, autocapture: autocaptureConfig(state) },
    // The plugins are only built when their section is switched on; null means "don't install it".
    sessionReplay: state.sessionReplay ? fieldSetValue(SESSION_REPLAY_OPTIONS, state.sessionReplayOptions) : null,
    engagement: state.engagement ? fieldSetValue(ENGAGEMENT_OPTIONS, state.engagementOptions) : null,
  };
}
