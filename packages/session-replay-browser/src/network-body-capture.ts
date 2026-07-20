import { pruneJson } from '@amplitude/analytics-core';

export type BodyCaptureRuleConfig =
  | boolean
  | {
      enabled?: boolean;
      allowlist?: string[];
      excludelist?: string[];
    };

export const isBodyCaptureEnabled = (config: BodyCaptureRuleConfig | undefined): boolean => {
  if (config === undefined) {
    return false;
  }
  if (typeof config === 'boolean') {
    return config;
  }
  return config.enabled !== false;
};

export const getBodyMaskingLists = (
  config: BodyCaptureRuleConfig | undefined,
): { allowlist: string[]; excludelist: string[] } => {
  if (typeof config === 'object' && config !== null) {
    return {
      allowlist: config.allowlist ?? [],
      excludelist: config.excludelist ?? [],
    };
  }
  return { allowlist: [], excludelist: [] };
};

export const applyBodyMasking = (serialized: string, allowlist: string[], excludelist: string[]): string => {
  if (allowlist.length === 0 && excludelist.length === 0) {
    return serialized;
  }

  const effectiveAllowlist = allowlist.length > 0 ? allowlist : ['/**'];

  try {
    const json = JSON.parse(serialized) as Record<string, unknown>;
    pruneJson(json, effectiveAllowlist, excludelist);
    return JSON.stringify(json);
  } catch {
    return serialized;
  }
};

export const captureSerializedBody = (
  serialized: string,
  config: BodyCaptureRuleConfig | undefined,
  maxBytes: number,
  truncate: (value: string, max: number) => { value: string; truncated: boolean },
): { value: string; truncated: boolean } => {
  const { allowlist, excludelist } = getBodyMaskingLists(config);
  const masked = applyBodyMasking(serialized, allowlist, excludelist);
  return truncate(masked, maxBytes);
};
