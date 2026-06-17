// Mock "Delayed Events Endpoint" (heartbeat service) for the engaged-dwell POC.
//
// Models three pieces of the proposed architecture:
//   1. /httpapi         - the regular ingestion endpoint. Events posted here are ingested
//                         immediately (source: "http-api").
//   2. /httpapi/delayed - the heartbeat endpoint. Each heartbeat carries a `delayedPayload`
//                         with `instant_events` (ingested now) and `events` (the delayed
//                         service replaces the whole row keyed by `id`, refreshing the
//                         timeout; the row is flushed only when the timeout expires).
//
// Every response piggybacks a `state` snapshot (delayed table + ingested pool) so the demo
// dashboards stay live off the heartbeat traffic alone — there is no separate polling
// endpoint. State is module-level so it survives across requests for the life of the
// dev server.

const TIMEOUT_MS = 10_000;
const REAPER_INTERVAL_MS = 250;

// id -> { id, expiresAt, lastHeartbeatAt, heartbeats, events }
const delayedTable = new Map();
// { seq, source, eventType, props, receivedAt }
const ingestedPool = [];
let seq = 0;

function ingest(source, events, request) {
  for (const event of events || []) {
    ingestedPool.push({
      seq: ++seq,
      source,
      eventType: event.event_type,
      props: event.event_properties || {},
      receivedAt: Date.now(),
      event, // the raw event object
      request, // the raw HTTP request body this event arrived in
    });
  }
}

// Flush delayed rows whose timeout has lapsed (no heartbeat for TIMEOUT_MS).
// This is what captures the *last* page view's dwell time without a subsequent
// page view to piggyback on.
function reap() {
  const now = Date.now();
  for (const [id, row] of delayedTable) {
    if (now >= row.expiresAt) {
      ingest('delayed-expired', row.events, row.request);
      delayedTable.delete(id);
    }
  }
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(payload));
}

// Current delayed table + ingested pool, piggybacked on every endpoint response so the
// demo dashboards stay live off the heartbeat traffic alone — no separate polling endpoint.
function snapshot() {
  const now = Date.now();
  return {
    timeoutMs: TIMEOUT_MS,
    delayed: [...delayedTable.values()].map((row) => ({
      id: row.id,
      remainingMs: Math.max(0, row.expiresAt - now),
      timeoutMs: TIMEOUT_MS,
      heartbeats: row.heartbeats,
      events: row.events,
      request: row.request,
    })),
    ingested: ingestedPool.slice(-100).reverse(),
  };
}

export function createDelayedEventsApi() {
  return {
    name: 'engaged-dwell-delayed-events',
    configureServer(server) {
      const reaper = setInterval(reap, REAPER_INTERVAL_MS);
      reaper.unref?.();

      // Heartbeat / delayed events endpoint.
      // Registered before /httpapi because connect matches by prefix and /httpapi would
      // otherwise also catch /httpapi/delayed.
      server.middlewares.use('/httpapi/delayed', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        const body = await readJson(req);

        // POC-only convenience: clear all state.
        if (body.reset) {
          delayedTable.clear();
          ingestedPool.length = 0;
          seq = 0;
          return sendJson(res, 200, { ok: true, state: snapshot() });
        }

        const { id, delayedPayload = {} } = body;
        const { instant_events = [], events = [] } = delayedPayload;

        // instant_events are ingested right away (e.g. "[Amplitude] Page Viewed").
        ingest('instant', instant_events, body);

        // events are held and refreshed; the delayed service replaces the whole row by id.
        // The latest heartbeat body is kept so it can be shown as the row's raw request and
        // attached to the event when it eventually flushes.
        const now = Date.now();
        if (events.length > 0) {
          const existing = delayedTable.get(id);
          delayedTable.set(id, {
            id,
            events,
            request: body,
            expiresAt: now + TIMEOUT_MS,
            lastHeartbeatAt: now,
            heartbeats: (existing?.heartbeats || 0) + 1,
          });
        }

        sendJson(res, 200, { ok: true, id, timeoutMs: TIMEOUT_MS, state: snapshot() });
      });

      // Regular ingestion endpoint.
      server.middlewares.use('/httpapi', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
        const body = await readJson(req);
        ingest('http-api', body.events, body);
        sendJson(res, 200, { ok: true, state: snapshot() });
      });
    },
  };
}
