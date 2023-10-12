export interface DiagnosticOptions {
  isDisabled?: boolean;
  serverUrl?: string;
  apiKey?: string;
}

export interface Diagnostic {
  apiKey?: string;
  track(eventCount: number, code: number, message: string): void;
}
