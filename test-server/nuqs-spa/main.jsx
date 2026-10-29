import React, { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { createInstance } from '@amplitude/analytics-browser';
import './styles.css';

const listeners = new Set();
let snapshot = { href: location.href, history: [], events: [], enabled: true, status: 'idle', mode: 'all', error: '' };
let sequence = 0;

function publish(change) {
  snapshot = { ...snapshot, ...change };
  listeners.forEach((listener) => listener());
}

function recordHistory(method, before) {
  const entry = { id: ++sequence, method, before, after: location.href, changed: before !== location.href };
  publish({ href: location.href, history: [...snapshot.history, entry].slice(-100) });
}

// Observe successful calls without generating synthetic popstate events or SDK events.
// nuqs and the SDK still own their normal history wrappers.
for (const method of ['pushState', 'replaceState']) {
  const original = history[method];
  history[method] = function (...args) {
    const before = location.href;
    const result = Reflect.apply(original, this, args);
    recordHistory(method, before);
    return result;
  };
}
window.addEventListener('popstate', () => recordHistory('popstate', snapshot.href));

const client = createInstance();
window.amplitude = client;
window.nuqsDemo = { client, getSnapshot: () => snapshot };

async function initialize({ apiKey, mode, serverZone }) {
  publish({ status: 'initializing', mode, error: '' });
  try {
    // Observe generated page views without replacing the SDK's transport or destination.
    client.add({
      name: 'nuqs-event-observer',
      type: 'enrichment',
      async execute(event) {
        if (event.event_type === '[Amplitude] Page Viewed') {
          publish({ events: [...snapshot.events, event] });
        }
        return event;
      },
    });
    await client.init(apiKey, undefined, {
      instanceName: 'nuqs-spa',
      serverZone,
      identityStorage: 'memory',
      fetchRemoteConfig: false,
      enableDiagnostics: false,
      flushQueueSize: 1,
      flushIntervalMillis: 100,
      autocapture: {
        attribution: false,
        fileDownloads: false,
        formInteractions: false,
        sessions: false,
        pageViews: { trackHistoryChanges: mode, trackOn: () => snapshot.enabled },
      },
    }).promise;
    publish({ status: 'ready' });
  } catch (error) {
    publish({ status: 'error', error: error.message });
  }
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;
const shortUrl = (href) => {
  const url = new URL(href);
  return `${url.pathname}${url.search}${url.hash}`;
};
const parsers = {
  q: parseAsString.withDefault(''),
  tab: parseAsString.withDefault('all'),
  page: parseAsInteger.withDefault(1),
};

function App() {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_AMPLITUDE_API_KEY || '');
  const [serverZone, setServerZone] = useState('US');
  const [historyMode, setHistoryMode] = useState('replace');
  const [filters, setFilters] = useQueryStates(parsers);
  const navigate = useNavigate();
  // Leave options unset for replace mode to exercise nuqs' actual default.
  const update = (patch) => setFilters(patch, historyMode === 'push' ? { history: 'push' } : undefined);
  const current = new URL(state.href);

  return (
    <main>
      <header>
        <div>
          <span className="eyebrow">SDK-413 · INTERACTIVE EXAMPLE</span>
          <h1>
            nuqs <span>×</span> page views
          </h1>
          <p>Change URL state. Watch what the SDK actually captures.</p>
        </div>
        <span className="badge">
          {state.status === 'ready' ? `SDK initialized · ${state.mode}` : 'SDK not initialized'}
        </span>
      </header>
      <section className="panel sdk-setup">
        <h2>Initialize Amplitude SDK</h2>
        <p className="muted">
          Use the project API key from .env or enter another test project's key. The real SDK sends events to that
          project.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void initialize({ apiKey: apiKey.trim(), mode: state.mode, serverZone });
          }}
        >
          <fieldset disabled={state.status !== 'idle'}>
            <div className="setup-fields">
              <label>
                Project API key
                <input
                  required
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                  placeholder="Enter your test project API key"
                />
              </label>
              <label>
                Page-view tracking
                <select value={state.mode} onChange={(event) => publish({ mode: event.target.value })}>
                  <option value="all">all (default)</option>
                  <option value="pathOnly">pathOnly</option>
                </select>
              </label>
              <label>
                Server zone
                <select value={serverZone} onChange={(event) => setServerZone(event.target.value)}>
                  <option value="US">US</option>
                  <option value="EU">EU</option>
                </select>
              </label>
            </div>
            <button className="primary" type="submit" disabled={!apiKey.trim()}>
              {state.status === 'initializing' ? 'Initializing…' : 'Initialize SDK'}
            </button>
          </fieldset>
        </form>
        {state.status === 'ready' && (
          <p role="status">
            SDK initialized with <code>{state.mode}</code>. Refresh to change initialization options.
          </p>
        )}
        {state.error && <p role="alert">{state.error} Refresh to retry initialization.</p>}
        <p className="hint">
          Prefilled from VITE_AMPLITUDE_API_KEY in the repository .env when available. Edits are not saved. Remote
          config is disabled so your selected mode stays in effect.
        </p>
      </section>
      <section className="url-bar" aria-label="Current URL">
        <span>URL</span>
        <code data-testid="current-url">{state.href}</code>
      </section>
      <div className="workspace">
        <fieldset className="panel controls" disabled={state.status !== 'ready'}>
          <div className="section-heading">
            <span className="step">01</span>
            <h2>Try the SPA</h2>
          </div>
          <p className="muted">React Router + nuqs query state. Initialize the SDK above to enable these controls.</p>
          <nav aria-label="Routes">
            <button
              className={current.pathname === '/' ? 'selected' : ''}
              onClick={() => navigate(`/${location.search}`)}
            >
              Catalog
            </button>
            <button
              className={current.pathname === '/settings' ? 'selected' : ''}
              onClick={() => navigate(`/settings${location.search}`)}
            >
              Settings
            </button>
            <button onClick={() => navigate(-1)}>← Back</button>
            <button onClick={() => navigate(1)}>Forward →</button>
          </nav>
          <label>
            nuqs history mode
            <select value={historyMode} onChange={(event) => setHistoryMode(event.target.value)}>
              <option value="replace">replace (nuqs default)</option>
              <option value="push">push</option>
            </select>
          </label>
          <label>
            Search{' '}
            <input
              value={filters.q}
              onChange={(event) => update({ q: event.target.value })}
              placeholder="Type a search…"
            />
          </label>
          <label>
            Category
            <select value={filters.tab} onChange={(event) => update({ tab: event.target.value, page: 1 })}>
              <option value="all">All products</option>
              <option value="favorites">Favorites</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <div className="button-row">
            <button onClick={() => update({ page: filters.page + 1 })}>Next page ({filters.page})</button>
            <button onClick={() => update({ page: filters.page })}>Write same value</button>
            <button onClick={() => update(null)}>Clear query</button>
          </div>
          <pre className="query-state">{JSON.stringify(filters, null, 2)}</pre>
          <h3>More history cases</h3>
          <div className="button-row">
            <button
              onClick={() =>
                navigate(`${current.pathname === '/settings' ? '/' : '/settings'}${location.search}`, { replace: true })
              }
            >
              Replace route
            </button>
            <button
              onClick={() =>
                navigate(
                  `${location.pathname}${location.search}${location.hash === '#details' ? '#summary' : '#details'}`,
                  { replace: true },
                )
              }
            >
              Replace hash
            </button>
            <button onClick={() => history.replaceState({ ...history.state, demoState: Date.now() }, '')}>
              State only
            </button>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={(event) => publish({ enabled: event.target.checked })}
            />
            Allow page views (trackOn)
          </label>
          <p className="hint">
            nuqs batches and throttles URL writes. Several keystrokes can become one history call and one page view.
          </p>
        </fieldset>
        <section className="results">
          <div className="section-heading">
            <span className="step">02</span>
            <h2>Observed page views</h2>
          </div>
          <article className={`counter ${state.mode}`}>
            <div className="counter-top">
              <code>
                {state.mode}
                {state.mode === 'all' ? ' (default)' : ''}
              </code>
              <strong data-testid="page-view-count">{state.events.length}</strong>
            </div>
            <p>{state.mode === 'all' ? 'Path, query & hash changes' : 'Path changes only'}</p>
            {state.status !== 'ready' && <p>Initialize the SDK to start capturing.</p>}
            <div className="event-list">
              {state.events
                .slice(-10)
                .reverse()
                .map((event, index) => (
                  <details key={`${event.insert_id}-${index}`}>
                    <summary>
                      <span className="dot" />
                      {shortUrl(event.event_properties['[Amplitude] Page Location'])}
                    </summary>
                    <pre>{JSON.stringify(event, null, 2)}</pre>
                  </details>
                ))}
            </div>
          </article>
          <div className="expectations">
            <h3>What to look for</h3>
            <p>
              <b>Query or hash replacement:</b> <code>all</code> +1, <code>pathOnly</code> +0.
            </p>
            <p>
              <b>Route replacement:</b> +1 with either mode.
            </p>
            <p>
              <b>Same URL or state only:</b> +0 with either mode.
            </p>
            <p>
              <b>trackOn unchecked:</b> URL changes still happen; capture pauses.
            </p>
            <p className="muted">
              Initialization captures one initial page view. Expand an entry to inspect the SDK event. This list shows
              observed events; use the Network panel or your Amplitude project to confirm delivery.
            </p>
          </div>
        </section>
      </div>
      <section className="panel trace">
        <div className="section-heading">
          <span className="step">03</span>
          <h2>History trace</h2>
          <span className="muted">Newest first · last 100 calls</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Call</th>
                <th>Resulting URL</th>
                <th>URL changed?</th>
              </tr>
            </thead>
            <tbody>
              {state.history
                .slice()
                .reverse()
                .map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <code>{entry.method}</code>
                    </td>
                    <td className="trace-url">
                      <code>{shortUrl(entry.after)}</code>
                    </td>
                    <td>
                      <span className={entry.changed ? 'changed' : 'unchanged'}>
                        {entry.changed ? 'Yes' : 'No · state only / same URL'}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <footer>
        Events are sent to your selected Amplitude project using the normal SDK transport. Refresh to reset and choose
        another tracking mode.
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <NuqsAdapter>
      <App />
    </NuqsAdapter>
  </BrowserRouter>,
);
