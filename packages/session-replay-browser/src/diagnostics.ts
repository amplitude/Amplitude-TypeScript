/**
 * Centralized names for Session Replay diagnostics shipped via the analytics DiagnosticsClient.
 *
 * Every name shares SR_DIAGNOSTIC_PREFIX so they group together in DataDog as
 * `sdk.diagnostics.sr.trc.*`. The diagnostics pipeline prepends `sdk.diagnostics.` and appends
 * `.count` to counters / `.{min,max,avg,count}` to histograms; events are forwarded to DataDog
 * Logs keyed by `event_name`. Keep ALL SR diagnostic names here so the prefix stays unified —
 * changing the namespace is then a one-line edit.
 */
export const SR_DIAGNOSTIC_PREFIX = 'sr.trc';

const p = SR_DIAGNOSTIC_PREFIX;

export const SrDiagnostic = {
  // ── Init (Q1: did init even happen?) ─────────────────────────────────────
  init: `${p}.init`, // counter + event(with props): fires once per init()

  // ── Remote config fetch (joined-config) ──────────────────────────────────
  configSource: (source: string) => `${p}.config.source.${source}`,
  configHasTargeting: `${p}.config.has_targeting`,
  configNoTargeting: `${p}.config.no_targeting`,
  configFetchFailed: `${p}.config.fetch_failed`,
  configReceived: `${p}.config.received`, // event (with props)

  // ── Targeting evaluation (evaluateTargetingAndCapture) ────────────────────
  // Q2 (did eval run?), Q3 (working/failed?), Q4 (missing value?), Q5 (all params).
  evalTrigger: (trigger: string) => `${p}.eval.${trigger}`, // init | urlchange | event
  evalNoConfig: `${p}.eval.no_config`,
  evalMissingPrereq: `${p}.eval.missing_prereq`, // Q4: sessionId/config/deviceId missing
  evalMatch: `${p}.eval.match`,
  evalNoMatch: `${p}.eval.no_match`,
  evalError: `${p}.eval.error`, // Q3: targeting engine threw
  evalStaleDiscarded: `${p}.eval.stale_discarded`,
  evalSkippedAlreadyMatched: `${p}.eval.skipped_already_matched`,
  evalDurationMs: `${p}.eval.duration_ms`, // histogram
  evalEvent: `${p}.eval`, // event (with ALL eval params — Q5)

  // ── Record / no-record gate (getShouldRecord) ────────────────────────────
  gateNoIdentifiers: `${p}.gate.no_identifiers`, // Q4: no config/sessionId at gate time
  gateCaptureDisabled: `${p}.gate.capture_disabled`,
  gateOptOut: `${p}.gate.optout`,
  gateTrcMatch: `${p}.gate.trc_match`,
  gateTrcNoMatch: `${p}.gate.trc_no_match`,
  gateSampleIn: `${p}.gate.sample_in`,
  gateSampleOut: `${p}.gate.sample_out`,
  decision: `${p}.decision`, // event (with props)

  // ── SPA URL change (setupUrlChangeListener) ──────────────────────────────
  urlChange: `${p}.url_change`,
  urlChangeEvent: `${p}.url_change`, // event (with props); same name, logs vs metric
} as const;
