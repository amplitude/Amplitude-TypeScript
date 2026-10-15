import {
  resolveSelectorConfig,
  type ElementSelectorRemoteConfig,
  type ResolvedSelectorConfig,
} from '@amplitude/element-selector';

import type { ZoningFlags } from './flags';
import { resolveZoningShadowDomConfig } from './shadow';

interface ElementInteractionsShadowConfig {
  shadowDomEnabled?: unknown;
  maxShadowDomDepth?: unknown;
}

interface AutocaptureSection {
  elementSelector?: ElementSelectorRemoteConfig | null;
  elementInteractions?: ElementInteractionsShadowConfig | null;
  [key: string]: unknown;
}

export interface BrowserSdkAutocaptureConfig {
  autocapture?: AutocaptureSection | null;
  [key: string]: unknown;
}

/**
 * Mirror `DataExtractor.updateRemoteConfig` in plugin-autocapture-browser:
 * shadow fields on `elementInteractions` overlay onto `elementSelector`.
 */
export const mergeElementInteractionsShadowConfig = (
  elementSelector: ElementSelectorRemoteConfig | null | undefined,
  elementInteractions: ElementInteractionsShadowConfig | null | undefined,
): ElementSelectorRemoteConfig | null | undefined => {
  if (!elementInteractions) {
    return elementSelector;
  }

  let merged = elementSelector;
  if (typeof elementInteractions.shadowDomEnabled === 'boolean') {
    merged = {
      ...(merged ?? {}),
      shadowDomEnabled: elementInteractions.shadowDomEnabled,
    };
  }
  if (typeof elementInteractions.maxShadowDomDepth === 'number') {
    merged = {
      ...(merged ?? {}),
      maxShadowDomDepth: elementInteractions.maxShadowDomDepth,
    };
  }
  return merged;
};

/**
 * Resolves remote `browserSDK` autocapture config into the effective selector
 * config for zoning, including shadow rollout gating.
 */
export const resolveZoningSelectorConfig = (browserSDK: unknown, flags: ZoningFlags): ResolvedSelectorConfig => {
  const sdk = browserSDK as BrowserSdkAutocaptureConfig | null | undefined;
  const autocapture = sdk?.autocapture;
  const elementSelectorRemote = mergeElementInteractionsShadowConfig(
    autocapture?.elementSelector ?? undefined,
    autocapture?.elementInteractions ?? undefined,
  );
  const remoteConfig = resolveSelectorConfig(elementSelectorRemote ?? undefined);
  return resolveZoningShadowDomConfig(remoteConfig, flags.shadowDom);
};
