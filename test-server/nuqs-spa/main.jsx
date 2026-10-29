import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { createInstance, Types } from '@amplitude/analytics-browser';
import './styles.css';

const client = createInstance();
const apiKey = import.meta.env.VITE_AMPLITUDE_API_KEY;
window.amplitude = client;

const parsers = {
  q: parseAsString.withDefault(''),
  tab: parseAsString.withDefault('all'),
  page: parseAsInteger.withDefault(1),
};

function App() {
  const [mode, setMode] = useState('all');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [historyMode, setHistoryMode] = useState('replace');
  const trackingEnabled = useRef(true);
  const [filters, setFilters] = useQueryStates(parsers);
  const route = useLocation();
  const navigate = useNavigate();
  // Leave options unset for replace mode to exercise nuqs' actual default.
  const update = (patch) => setFilters(patch, historyMode === 'push' ? { history: 'push' } : undefined);

  async function initialize(event) {
    event.preventDefault();
    setStatus('initializing');
    try {
      await client.init(apiKey, undefined, {
        instanceName: 'nuqs-spa',
        serverZone: 'US',
        logLevel: Types.LogLevel.Debug,
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
          pageViews: { trackHistoryChanges: mode, trackOn: () => trackingEnabled.current },
        },
      }).promise;
      setStatus('ready');
    } catch (initError) {
      setError(initError.message);
      setStatus('error');
    }
  }

  return (
    <main>
      <h1>nuqs page-view test</h1>
      <p>Watch SDK debug logs in the console and requests in the Network panel.</p>
      <form onSubmit={initialize}>
        <fieldset disabled={status !== 'idle'}>
          <label>
            Page-view tracking
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="all">all (default)</option>
              <option value="pathOnly">pathOnly</option>
            </select>
          </label>
          <button type="submit" disabled={!apiKey}>
            {status === 'initializing' ? 'Initializing…' : 'Initialize SDK'}
          </button>
        </fieldset>
      </form>
      {!apiKey && <p role="alert">Set VITE_AMPLITUDE_API_KEY in the repository .env and restart the dev server.</p>}
      {status === 'ready' && <p role="status">SDK initialized with {mode}. Refresh to change mode.</p>}
      {error && <p role="alert">{error} Refresh to retry.</p>}

      <fieldset disabled={status !== 'ready'}>
        <legend>SPA controls</legend>
        <nav aria-label="Routes">
          <button className={route.pathname === '/' ? 'selected' : ''} onClick={() => navigate(`/${location.search}`)}>
            Catalog
          </button>
          <button
            className={route.pathname === '/settings' ? 'selected' : ''}
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
          Search
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
        <div className="buttons">
          <button onClick={() => update({ page: filters.page + 1 })}>Next page ({filters.page})</button>
          <button onClick={() => update({ page: filters.page })}>Write same value</button>
          <button onClick={() => update(null)}>Clear query</button>
        </div>
        <pre>{JSON.stringify(filters, null, 2)}</pre>
        <div className="buttons">
          <button
            onClick={() =>
              navigate(`${location.pathname === '/settings' ? '/' : '/settings'}${location.search}`, { replace: true })
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
        <label className="checkbox">
          <input
            type="checkbox"
            defaultChecked
            onChange={(event) => {
              trackingEnabled.current = event.target.checked;
            }}
          />
          Allow page views (trackOn)
        </label>
      </fieldset>
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
