export interface DiagnosticOmniMetrics {
  metadata_type: string;
  library: string;
  accounting_time_min: number;
  response_code: number;
  trigger: string;
  action: string;
  event_count: number;
}

export interface DiagnosticEvent {
  api_key: string;
  omni_metrics: DiagnosticOmniMetrics;
}
