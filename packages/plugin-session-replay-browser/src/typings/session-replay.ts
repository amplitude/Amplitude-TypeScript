export interface SessionReplayPrivacyConfig {
  blockSelector?: string | string[];
  maskTextFn?: (text: string, element: HTMLElement | null) => string;
}
export interface SessionReplayOptions {
  sampleRate?: number;
  privacyConfig?: SessionReplayPrivacyConfig;
  debugMode?: boolean;
  forceSessionTracking?: boolean;
}
