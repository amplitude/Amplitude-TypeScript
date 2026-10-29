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

function Action({ children, code, operation, expectedAll, expectedPathOnly, ...buttonProps }) {
  return (
    <tr>
      <th scope="row">
        <div className="action">
          <button {...buttonProps}>{children}</button>
          <code>{code}</code>
          <small>{operation}</small>
        </div>
      </th>
      <td>{expectedAll}</td>
      <td>{expectedPathOnly}</td>
    </tr>
  );
}

function App() {
  const [mode, setMode] = useState('all');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [historyMode, setHistoryMode] = useState('replace');
  const trackingEnabled = useRef(true);
  const [filters, setFilters] = useQueryStates(parsers);
  const queryOperation = `nuqs → history.${historyMode === 'push' ? 'pushState' : 'replaceState'}(...)`;
  const route = useLocation();
  const navigate = useNavigate();
  // Leave options unset for replace mode to exercise nuqs' actual default.
  const update = (patch) => setFilters(patch, historyMode === 'push' ? { history: 'push' } : undefined);

  function replaceRoute() {
    const nextRoute = `${location.pathname === '/settings' ? '/' : '/settings'}${location.search}`;
    navigate(nextRoute, { replace: true });
  }

  function replaceHash() {
    const nextHashUrl = `${location.pathname}${location.search}${
      location.hash === '#details' ? '#summary' : '#details'
    }`;
    navigate(nextHashUrl, { replace: true });
  }

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
        <details>
          <summary>Code used by the nuqs query controls</summary>
          <pre>
            {
              "const update = (patch) => setFilters(\n  patch,\n  historyMode === 'push' ? { history: 'push' } : undefined\n);"
            }
          </pre>
        </details>
        <pre>{JSON.stringify(filters, null, 2)}</pre>
        <div className="table-scroll">
          <table>
            <caption>
              Expected additional page views with trackOn checked. Back/Forward require an existing SPA history entry.
              nuqs may batch query updates.
            </caption>
            <thead>
              <tr>
                <th scope="col">Button / underlying code</th>
                <th scope="col" className={mode === 'all' ? 'active-mode' : ''}>
                  all (default)
                </th>
                <th scope="col" className={mode === 'pathOnly' ? 'active-mode' : ''}>
                  pathOnly
                </th>
              </tr>
            </thead>
            <tbody>
              <Action
                expectedAll="1 if URL changes; otherwise 0"
                expectedPathOnly="1 if path changes; otherwise 0"
                code={"navigate('/' + location.search)"}
                operation="history.pushState(...)"
                className={route.pathname === '/' ? 'selected' : ''}
                onClick={() => navigate(`/${location.search}`)}
              >
                Catalog
              </Action>
              <Action
                expectedAll="1 if URL changes; otherwise 0"
                expectedPathOnly="1 if path changes; otherwise 0"
                code={"navigate('/settings' + location.search)"}
                operation="history.pushState(...)"
                className={route.pathname === '/settings' ? 'selected' : ''}
                onClick={() => navigate(`/settings${location.search}`)}
              >
                Settings
              </Action>
              <Action
                expectedAll="1 if URL changes; otherwise 0"
                expectedPathOnly="1 if path changes; otherwise 0"
                code="navigate(-1)"
                operation="history.go(-1) → popstate"
                onClick={() => navigate(-1)}
              >
                ← Back
              </Action>
              <Action
                expectedAll="1 if URL changes; otherwise 0"
                expectedPathOnly="1 if path changes; otherwise 0"
                code="navigate(1)"
                operation="history.go(1) → popstate"
                onClick={() => navigate(1)}
              >
                Forward →
              </Action>
              <Action
                expectedAll="1 per query URL update"
                expectedPathOnly="0"
                code="update({ page: filters.page + 1 })"
                operation={queryOperation}
                onClick={() => update({ page: filters.page + 1 })}
              >
                Next page ({filters.page})
              </Action>
              <Action
                expectedAll="0 if URL is unchanged"
                expectedPathOnly="0"
                code="update({ page: filters.page })"
                operation={queryOperation}
                onClick={() => update({ page: filters.page })}
              >
                Write same value
              </Action>
              <Action
                expectedAll="1 if query changes; otherwise 0"
                expectedPathOnly="0"
                code="update(null)"
                operation={queryOperation}
                onClick={() => update(null)}
              >
                Clear query
              </Action>
              <Action
                expectedAll="1"
                expectedPathOnly="1"
                code="navigate(nextRoute, { replace: true })"
                operation="history.replaceState(...) · toggles / and /settings"
                onClick={replaceRoute}
              >
                Replace route
              </Action>
              <Action
                expectedAll="1"
                expectedPathOnly="0"
                code="navigate(nextHashUrl, { replace: true })"
                operation="history.replaceState(...) · toggles #details and #summary"
                onClick={replaceHash}
              >
                Replace hash
              </Action>
              <Action
                expectedAll="0"
                expectedPathOnly="0"
                code={"history.replaceState({ ...history.state, demoState: Date.now() }, '')"}
                operation="Replaces state without changing the URL"
                onClick={() => history.replaceState({ ...history.state, demoState: Date.now() }, '')}
              >
                State only
              </Action>
            </tbody>
          </table>
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
        <p className="control-help">
          Checked allows page views; unchecked pauses them while URL changes still work.
          <br />
          <code>trackOn: () =&gt; trackingEnabled.current</code>
        </p>
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
