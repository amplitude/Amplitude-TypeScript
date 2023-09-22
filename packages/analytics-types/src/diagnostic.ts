export interface DiagnosticOptions {
  isDisabled?: boolean;
  serverUrl?: string;
}

export interface Diagnostic extends DiagnosticOptions {
  track(eventCount: number, code: number, message: string): void;
}
