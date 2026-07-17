import { SAFE_HEADERS } from '../types/constants';

/**
 * Performs a deep transformation of a remote config object so that
 * it matches the expected schema of the local config.
 *
 * Specifically, it normalizes nested `enabled` flags into concise union types.
 *
 * ### Transformation Rules:
 * - If an object has `enabled: true`, it is replaced by the same object without the `enabled` field.
 * - If it has only `enabled: true`, it is replaced with `true`.
 * - If it has `enabled: false`, it is replaced with `false` regardless of other fields.
 *
 * ### Examples:
 * Input:  { prop: { enabled: true, hello: 'world' }}
 * Output: { prop: { hello: 'world' } }
 *
 * Input:  { prop: { enabled: true }}
 * Output: { prop: true }
 *
 * Input:  { prop: { enabled: false, hello: 'world' }}
 * Output: { prop: false }
 *
 * Input:  { prop: { hello: 'world' }}
 * Output: { prop: { hello: 'world' } } // No change
 *
 * @param config Remote config object to be transformed
 * @returns Transformed config object compatible with local schema
 */
export function translateRemoteConfigToLocal(config?: Record<string, any>) {
  // Disabling type checking rules because remote config comes from a remote source
  // and this function needs to handle any unexpected values
  /* eslint-disable @typescript-eslint/no-unsafe-member-access,
     @typescript-eslint/no-unsafe-assignment,
     @typescript-eslint/no-unsafe-argument
 */
  if (typeof config !== 'object' || config === null) {
    return;
  }

  // translations are not applied on array properties
  if (Array.isArray(config)) {
    return;
  }

  const propertyNames = Object.keys(config);
  for (const propertyName of propertyNames) {
    try {
      const value = config[propertyName];
      // transform objects with { enabled } property to boolean | object
      if (typeof value?.enabled === 'boolean') {
        if (value.enabled) {
          // if enabled is true, set the value to the rest of the object
          // or true if the object has no other properties
          delete value.enabled;
          if (Object.keys(value).length === 0) {
            (config as any)[propertyName] = true;
          }
        } else {
          // If enabled is false, set the value to false
          (config as any)[propertyName] = false;
        }
      }

      // recursively translate properties of the value
      translateRemoteConfigToLocal(value as Record<string, any>);
    } catch (e) {
      // a failure here means that an accessor threw an error
      // so don't translate it
      // TODO(diagnostics): add a diagnostic event for this
    }
  }

  // translate remote responseHeaders and requestHeaders to local responseHeaders and requestHeaders
  try {
    if (config.autocapture?.networkTracking?.captureRules?.length) {
      for (const rule of config.autocapture.networkTracking.captureRules) {
        for (const header of ['responseHeaders', 'requestHeaders']) {
          const { captureSafeHeaders, allowlist } = rule[header] ?? {};
          if (!captureSafeHeaders && !allowlist) {
            continue;
          }
          // if allowlist is not an array, remote config contract is violated, remove it
          if (allowlist !== undefined && !Array.isArray(allowlist)) {
            delete rule[header];
            continue;
          }
          rule[header] = [...(captureSafeHeaders ? SAFE_HEADERS : []), ...(allowlist ?? [])];
        }
      }
    }
  } catch (e) {
    /* istanbul ignore next */
    // surprise exception, so don't translate it
  }

  // translate frustrationInteractions pluralization
  const frustrationInteractions = config.autocapture?.frustrationInteractions;
  if (frustrationInteractions) {
    if (frustrationInteractions.rageClick) {
      frustrationInteractions.rageClicks = frustrationInteractions.rageClick;
      delete frustrationInteractions.rageClick;
    }
    if (frustrationInteractions.deadClick) {
      frustrationInteractions.deadClicks = frustrationInteractions.deadClick;
      delete frustrationInteractions.deadClick;
    }
  }

  // normalize viewportContentUpdated inside elementInteractions
  try {
    const elementInteractions = config.autocapture?.elementInteractions;
    if (elementInteractions && typeof elementInteractions === 'object') {
      // { enabled: true } (no other fields) collapses to `true`; convert back to {} for the SDK.
      if (elementInteractions.viewportContentUpdated === true) {
        elementInteractions.viewportContentUpdated = {};
      }
      // { enabled: false, ... } collapses to `false`; convert back to { enabled: false } for the SDK.
      if (elementInteractions.viewportContentUpdated === false) {
        elementInteractions.viewportContentUpdated = { enabled: false };
      }
      // Migrate deprecated top-level exposureDuration to viewportContentUpdated.exposureDuration
      if (elementInteractions.exposureDuration !== undefined) {
        const viewportContentUpdated = elementInteractions.viewportContentUpdated;
        if (viewportContentUpdated === undefined) {
          elementInteractions.viewportContentUpdated = { exposureDuration: elementInteractions.exposureDuration };
        } else if (
          typeof viewportContentUpdated === 'object' &&
          viewportContentUpdated.exposureDuration === undefined &&
          viewportContentUpdated.enabled !== false
        ) {
          viewportContentUpdated.exposureDuration = elementInteractions.exposureDuration;
        }
        delete elementInteractions.exposureDuration;
      }
    }
  } catch (e) {
    /* istanbul ignore next */
    // surprise exception, so don't translate it
  }
}
