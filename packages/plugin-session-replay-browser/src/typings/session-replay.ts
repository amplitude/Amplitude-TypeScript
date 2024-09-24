export type MaskLevel =
  | 'light' // only mask a subset of inputs that’s deemed sensitive - password, credit card, telephone #, email. These are information we never want to capture.
  | 'medium' // mask all inputs
  | 'conservative'; // mask all inputs and all texts

export interface SessionReplayPrivacyConfig {
  blockSelector?: string | string[];
  defaultMaskLevel?: MaskLevel;
  maskSelector?: string[];
  unmaskSelector?: string[];
}

export interface SessionReplayPerformanceConfig {
  enabled: boolean;
}

export interface SessionReplayOptions {
  sampleRate?: number;
  privacyConfig?: SessionReplayPrivacyConfig;
  debugMode?: boolean;
  forceSessionTracking?: boolean;
  configEndpointUrl?: string;
  shouldInlineStylesheet?: boolean;
  performanceConfig?: SessionReplayPerformanceConfig;
}
