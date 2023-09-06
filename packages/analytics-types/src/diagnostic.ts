export interface Diagnostic {
  track(eventCount: number, code: number, message: string): void;
}
