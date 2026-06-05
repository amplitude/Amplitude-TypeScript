import { AMPLITUDE_PREFIX, ServerZone } from '@amplitude/analytics-core';

export const DEFAULT_EVENT_PROPERTY_PREFIX = '[Amplitude]';

export const DEFAULT_SESSION_REPLAY_PROPERTY = `${DEFAULT_EVENT_PROPERTY_PREFIX} Session Replay ID`;
export const DEFAULT_SESSION_START_EVENT = 'session_start';
export const DEFAULT_SESSION_END_EVENT = 'session_end';
export const DEFAULT_SAMPLE_RATE = 0;
export const DEFAULT_SERVER_ZONE = ServerZone.US;
export const DEFAULT_PERFORMANCE_CONFIG = { enabled: true };
export const DEFAULT_URL_CHANGE_POLLING_INTERVAL = 1000;

export const SESSION_REPLAY_DEBUG_PROPERTY = `${DEFAULT_EVENT_PROPERTY_PREFIX} Session Replay Debug`;

export const BLOCK_CLASS = 'amp-block';
export const MASK_TEXT_CLASS = 'amp-mask';
export const UNMASK_TEXT_CLASS = 'amp-unmask';
export const SESSION_REPLAY_SERVER_URL = 'https://api-sr.amplitude.com/sessions/v2/track';
export const SESSION_REPLAY_EU_URL = 'https://api-sr.eu.amplitude.com/sessions/v2/track';
export const SESSION_REPLAY_STAGING_URL = 'https://api-sr.stag2.amplitude.com/sessions/v2/track';
export const STORAGE_PREFIX = `${AMPLITUDE_PREFIX}_replay_unsent`;
// Reduced from 1,000,000 to leave headroom for double-JSON-encoding overhead and the
// uncompressed fallback path. The HTTP body is ~10-30% larger than raw string length
// because events are re-serialized inside the { version, events } wrapper at send time.
export const MAX_EVENT_LIST_SIZE = 700_000;
// 9 MB UTF-8 bytes — just under the server's 10 MB per-event threshold. Compared against the
// UTF-8 byte length of the serialized event (via Blob/TextEncoder), not the JS string length,
// so multi-byte payloads (CJK, emoji) are gated correctly.
export const MAX_SINGLE_EVENT_SIZE = 9 * 1000000;
// WAF rejects oversized compressed payloads with a body containing wording like
// "Payload exceeds the maximum allowed size of 10MB". Match loosely so vendor wording
// tweaks (rule updates, capitalization, etc.) don't silently disable bisect-retry.
export const WAF_PAYLOAD_TOO_LARGE_PATTERN = /payload.*exceed/i;
export const INTERACTION_MIN_INTERVAL = 30_000; // 30 seconds
export const INTERACTION_MAX_INTERVAL = 60_000; // 1 minute
export const MIN_INTERVAL = 500; // 500 ms
export const MAX_INTERVAL = 10 * 1000; // 10 seconds
export const MAX_IDB_STORAGE_LENGTH = 1000 * 60 * 60 * 24 * 3; // 3 days
export const KB_SIZE = 1024;
export const MAX_URL_LENGTH = 1000;
export const RETRY_TIMEOUT_MS = 1000;
export const MAX_KEEPALIVE_BYTES = 64 * 1024; // browser keepalive budget shared with sendBeacon
// Per-request send timeout. fetch() has no native timeout, so a single hung request
// (stuck "pending" forever) would otherwise block the serial flush loop indefinitely —
// head-of-line blocking that stalls every queued batch behind it. We abort after this
// many ms so each send always settles and the queue keeps draining.
export const SEND_TIMEOUT_MS = 10_000;

// Server returns 200 + this header for "no-retry" drops (throttle / capture disabled / out-of-range).
// See projects/sessionreplay/sessionreplay-ingestion/.../SessionReplayError.java.
// Header value is the numeric error code as a string.
export const EVENT_SKIPPED_HEADER = 'X-Session-Replay-Event-Skipped';
export const EVENT_SKIP_CODE_THROTTLED = '429';
export const EVENT_SKIP_CODE_INVALID_RANGE = '4004';
export const EVENT_SKIP_CODE_CAPTURE_DISABLED = '4005';
// How long to pause the flush schedule after the server signals a throttle.
export const THROTTLED_FLUSH_PAUSE_MS = 60_000;
// Soft UTF-8 byte cap for merging same-session contexts after a throttle pause.
// Set to 2 * MAX_EVENT_LIST_SIZE so we'll merge at most ~2 max-size sequences (or many
// small ones) into one POST — fewer requests during recovery without pushing close to
// the server's 10MB-compressed 413 ceiling. Compared against UTF-8 byte size (via Blob)
// to match the per-sequence limit's units enforced upstream by base-events-store.
export const MERGE_AFTER_THROTTLE_SOFT_CAP = 2 * MAX_EVENT_LIST_SIZE;

export const CROSS_ORIGIN_IFRAME_MESSAGE_TYPE = 'amplitude-sr-iframe';

export enum CustomRRwebEvent {
  GET_SR_PROPS = 'get-sr-props',
  DEBUG_INFO = 'debug-info',
  FETCH_REQUEST = 'fetch-request',
  METADATA = 'metadata',
  TARGETING_DECISION = 'targeting-decision',
  /**
   * Emitted once per session, on the first send that passes the min_session_duration_ms
   * gate. Captures how many sends were suppressed before passing and the elapsed time
   * spent below the threshold. Lets backend ingestion diff intended replay count vs
   * actual ingestion so on-call can spot start-time-tracking regressions.
   *
   * Sessions that bounce before crossing the threshold never emit this event by design
   * (the whole payload is suppressed); their absence is the signal.
   */
  REPLAY_GATE_DECISION = 'replay-gate-decision',
}
