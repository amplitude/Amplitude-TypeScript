import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import { parseAsInteger, useQueryState } from 'nuqs';
import { createInstance, Types } from '@amplitude/analytics-browser';
import './styles.css';

const client = createInstance();
const apiKey = import.meta.env.VITE_AMPLITUDE_API_KEY;
window.amplitude = client;

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
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const queryOperation = `nuqs → history.${historyMode === 'push' ? 'pushState' : 'replaceState'}(...)`;
  const navigate = useNavigate();

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
          pageViews: { trackHistoryChanges: mode },
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
        <div className="table-scroll">
          <table>
            <caption>
              Expected additional page views. Back/Forward require an existing SPA history entry. nuqs may batch query
              updates.
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
                onClick={() => navigate(`/${location.search}`)}
              >
                Catalog
              </Action>
              <Action
                expectedAll="1 if URL changes; otherwise 0"
                expectedPathOnly="1 if path changes; otherwise 0"
                code={"navigate('/settings' + location.search)"}
                operation="history.pushState(...)"
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
                code="setPage(page + 1, { history: historyMode })"
                operation={queryOperation}
                onClick={() => setPage(page + 1, { history: historyMode })}
              >
                Next page ({page})
              </Action>
              <Action
                expectedAll="0 if URL is unchanged"
                expectedPathOnly="0"
                code="setPage(page, { history: historyMode })"
                operation={queryOperation}
                onClick={() => setPage(page, { history: historyMode })}
              >
                Write same value
              </Action>
              <Action
                expectedAll="1 if query changes; otherwise 0"
                expectedPathOnly="0"
                code="setPage(null, { history: historyMode })"
                operation={queryOperation}
                onClick={() => setPage(null, { history: historyMode })}
              >
                Clear page query
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
