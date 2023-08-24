export interface DiagnosticEvent {
  time: number;
  event_properties: {
    response_error_code: number;
    trigger: string;
    action: string;
    event_count: number;
  };
  library: string;
}
