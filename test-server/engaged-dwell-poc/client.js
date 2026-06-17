// Engaged-dwell POC client — a stand-in for what the Browser SDK autocapture
// plugin would do. It is intentionally tiny and dependency-free so the network
// traffic is easy to read in DevTools.
//
// Per page load:
//   * the FIRST heartbeat carries the "[Amplitude] Page Viewed" event as an
//     `instant_event` (ingested immediately, exactly once);
//   * EVERY heartbeat (every HEARTBEAT_MS) carries the running
//     "[Amplitude] Page Viewed Completed" event as a delayed `event`, refreshing
//     the server-side timeout and the accumulated engaged-dwell time;
//   * when the page is torn down (navigation/close), heartbeats simply stop and
//     the server flushes the last snapshot once the timeout lapses. That is how
//     the final page's dwell time gets captured with no successor page view.

const HEARTBEAT_MS = 1000;
const API = {
  httpapi: '/httpapi',
  delayed: '/httpapi/delayed',
};

const PAGE = window.DWELL_PAGE || { name: location.pathname, path: location.pathname };
// Unique per page *view* so page-1 and page-2 occupy separate rows in the delayed table.
const pageViewId = `${PAGE.name}-${Math.random().toString(36).slice(2, 8)}`;

// --- engaged-dwell accumulation (counts only while the tab is visible) ---
let engagedMs = 0;
let lastResume = document.visibilityState === 'visible' ? Date.now() : null;

function accumulate() {
  if (lastResume != null) {
    const now = Date.now();
    engagedMs += now - lastResume;
    lastResume = now;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    lastResume = Date.now();
  } else {
    accumulate();
    lastResume = null;
  }
});

// --- event builders ---
function pageViewedEvent() {
  return {
    event_type: '[Amplitude] Page Viewed',
    event_properties: {
      '[Amplitude] Page Path': PAGE.path,
      '[Amplitude] Page Title': PAGE.name,
    },
  };
}

function pageViewedCompletedEvent() {
  return {
    event_type: '[Amplitude] Page Viewed Completed',
    event_properties: {
      '[Amplitude] Page Path': PAGE.path,
      '[Amplitude] Page Title': PAGE.name,
      '[Amplitude] Engaged Dwell Time (ms)': engagedMs,
    },
  };
}

let heartbeats = 0;
function heartbeat() {
  accumulate();
  heartbeats += 1;
  const body = {
    id: pageViewId,
    delayedPayload: {
      // Send the page view exactly once, on the first heartbeat.
      instant_events: heartbeats === 1 ? [pageViewedEvent()] : [],
      events: [pageViewedCompletedEvent()],
    },
  };
  // keepalive lets the very last heartbeat survive a same-tab navigation.
  post(API.delayed, body, { keepalive: true });
  renderLocal();
}

// A plain event through the regular ingestion endpoint, for contrast.
function trackViaHttpApi(eventType) {
  post(API.httpapi, { events: [{ event_type: eventType, event_properties: { via: 'http-api' } }] });
}

// Every endpoint response carries a fresh `state` snapshot, so the dashboard stays live
// off the heartbeat traffic alone — no separate polling endpoint.
function post(url, body, opts = {}) {
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...opts,
  })
    .then((res) => res.json())
    .then((data) => data.state && renderState(data.state))
    .catch(() => {});
}

// ---------------- dashboard ----------------
const fmt = (ms) => (ms / 1000).toFixed(1) + 's';

function renderLocal() {
  const el = document.getElementById('dwell-local');
  if (el) {
    el.textContent = `pageViewId=${pageViewId}  ·  engaged dwell=${fmt(engagedMs)}  ·  heartbeats sent=${heartbeats}`;
  }
}

function eventsSummary(events) {
  return events
    .map((e) => {
      const d = e.event_properties?.['[Amplitude] Engaged Dwell Time (ms)'];
      return d == null ? e.event_type : `${e.event_type} (dwell ${fmt(d)})`;
    })
    .join(', ');
}

let lastState = { delayed: [], ingested: [] };
let selected = null; // { kind: 'ingested' | 'delayed', key }

const isSelected = (kind, key) =>
  selected && selected.kind === kind && String(selected.key) === String(key);

function renderState(state) {
  lastState = state;

  const delayedRows = state.delayed
    .map(
      (r) => `<tr class="clickable ${isSelected('delayed', r.id) ? 'sel' : ''}" data-kind="delayed" data-key="${r.id}">
        <td>${r.id}</td>
        <td>${fmt(r.remainingMs)} <span class="muted">/ ${fmt(r.timeoutMs)} · ${r.heartbeats} hb</span></td>
        <td>${eventsSummary(r.events)}</td>
      </tr>`,
    )
    .join('');
  const delayedBody = document.querySelector('#dwell-delayed tbody');
  if (delayedBody) {
    delayedBody.innerHTML =
      delayedRows || '<tr><td colspan="3" class="muted">(empty — no page currently heartbeating)</td></tr>';
  }

  const badge = { 'http-api': '#2563eb', instant: '#16a34a', 'delayed-expired': '#d97706' };
  const ingestRows = state.ingested
    .map((e) => {
      const d = e.props?.['[Amplitude] Engaged Dwell Time (ms)'];
      return `<tr class="clickable ${isSelected('ingested', e.seq) ? 'sel' : ''}" data-kind="ingested" data-key="${e.seq}">
        <td>${e.seq}</td>
        <td><span class="tag" style="background:${badge[e.source] || '#666'}">${e.source}</span></td>
        <td>${e.eventType}${d == null ? '' : ` <span class="muted">(dwell ${fmt(d)})</span>`}</td>
      </tr>`;
    })
    .join('');
  const ingestBody = document.querySelector('#dwell-ingested tbody');
  if (ingestBody) {
    ingestBody.innerHTML =
      ingestRows || '<tr><td colspan="3" class="muted">(empty)</td></tr>';
  }

  renderRaw();
}

// Show the raw HTTP request body that carried the selected event (or the latest heartbeat
// body for a delayed row). Re-runs on every state update so a still-held delayed row stays
// fresh as its dwell time grows.
function renderRaw() {
  const pre = document.getElementById('dwell-raw');
  if (!pre || !selected) return;
  let item, request;
  if (selected.kind === 'ingested') {
    item = lastState.ingested.find((e) => String(e.seq) === String(selected.key));
    request = item?.request;
  } else {
    item = lastState.delayed.find((r) => String(r.id) === String(selected.key));
    request = item?.request;
  }
  if (!item) {
    pre.textContent = '(event no longer present — it may have flushed; click its row in the ingested pool)';
    return;
  }
  const label =
    selected.kind === 'ingested'
      ? `POST ${item.source === 'http-api' ? '/httpapi' : '/httpapi/delayed'}  (event #${item.seq}, source: ${item.source})`
      : `POST /httpapi/delayed  (delayed row id: ${item.id} — latest heartbeat)`;
  pre.textContent = `${label}\n\n${JSON.stringify(request, null, 2)}`;
}

function onRowClick(e) {
  const tr = e.target.closest('tr[data-key]');
  if (!tr) return;
  selected = { kind: tr.dataset.kind, key: tr.dataset.key };
  renderState(lastState); // refresh highlight + raw panel
}

// ---------------- wire up ----------------
document.getElementById('dwell-ingested')?.addEventListener('click', onRowClick);
document.getElementById('dwell-delayed')?.addEventListener('click', onRowClick);
document.getElementById('dwell-http-btn')?.addEventListener('click', () =>
  trackViaHttpApi('[Demo] Button Clicked'),
);
document.getElementById('dwell-reset-btn')?.addEventListener('click', () => {
  selected = null;
  post(API.delayed, { reset: true });
});

heartbeat(); // first heartbeat: page view (instant) + dwell snapshot (delayed)
setInterval(heartbeat, HEARTBEAT_MS);
renderLocal();
