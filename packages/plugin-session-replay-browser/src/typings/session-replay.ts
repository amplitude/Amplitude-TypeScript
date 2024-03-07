export interface SessionReplayPrivacyConfig {
  blockSelector?: string | string[];
}
export interface SessionReplayOptions {
  sampleRate?: number;
  privacyConfig?: SessionReplayPrivacyConfig;
  debugMode?: boolean;
  disableSessionTracking?: boolean;
}
