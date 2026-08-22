// Shared behaviour for every field in the configurator, used by both the top-level config schema and
// the autocapture sub-options.
//
// Field types:
//   boolean    - checkbox seeded at the SDK default
//   string     - text input; blank means "leave unset"
//   number     - numeric input; blank means "leave unset"
//   enum       - select of `choices`; blank means "leave unset"
//   stringList - comma-separated text, emitted as an array literal
//   regexList  - for `(string | RegExp)[]` options: exact values plus patterns, merged into one array
//   group      - nested object of `fields` (e.g. cookieOptions)
//   ruleList   - repeatable list of objects (networkTracking.captureRules)

// Exact values are comma-separated, but patterns get a line each: a regex is free to contain a comma
// (`\d{1,3}`), so splitting them on one would quietly break the pattern.
export function parseList(value) {
  return splitOn(value, ',');
}

export function parsePatterns(value) {
  return splitOn(value, '\n');
}

function splitOn(value, separator) {
  return String(value ?? '')
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createDefaultValue(field) {
  switch (field.type) {
    case 'boolean':
      return field.defaultValue;
    case 'ruleList':
      return [];
    case 'regexList':
      return { list: '', regexes: '' };
    case 'group':
      return createDefaultValues(field.fields);
    default:
      return '';
  }
}

export function createDefaultValues(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.key, createDefaultValue(field)]));
}

// A field only reaches the generated snippet once it differs from the SDK default, which keeps the
// output to just what was deliberately configured.
export function isFieldChanged(field, value) {
  switch (field.type) {
    case 'boolean':
      return value !== field.defaultValue;
    case 'ruleList':
      return Array.isArray(value) && value.length > 0;
    case 'regexList':
      return parseList(value?.list).length > 0 || parsePatterns(value?.regexes).length > 0;
    case 'group':
      return changedFields(field.fields, value ?? {}).length > 0;
    default:
      return value !== undefined && String(value).trim() !== '';
  }
}

export function changedFields(fields = [], values = {}) {
  return fields.filter((field) => isFieldChanged(field, values[field.key]));
}
