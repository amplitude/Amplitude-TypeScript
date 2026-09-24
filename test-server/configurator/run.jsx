// Runs the configuration the configurator built: the same link the form produces opens here, and this
// page initialises the real SDK with it and shows what comes out.
//
// The SDK is loaded as ESM from packages/ (vite aliases @amplitude/* to this checkout), so what runs is
// the code in this working tree, not a published bundle. Those imports are dynamic, because they resolve
// to built output: a checkout that hasn't run `pnpm build` should say so on the page rather than fail to
// render at all.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, CodeBlock, Note } from './components.jsx';
import { createDefaultState } from './default-state.js';
import { buildRuntimeConfig } from './runtime-config.js';
import { decodeStateFromUrl, hasSavedState } from './share-link.js';
import { buildSnippet, PLACEHOLDER_API_KEY } from './snippet.js';

const styles = {
  page: { fontFamily: 'system-ui, sans-serif', maxWidth: 1400, margin: '48px auto', padding: '0 16px' },
  heading: { marginBottom: 8 },
  intro: { color: '#666', marginTop: 0 },
  layout: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 },
  column: { flex: '1 1 460px', minWidth: 0 },
  outputColumn: { flex: '1 1 460px', minWidth: 0, position: 'sticky', top: 24 },
  sectionHeading: { fontSize: 16, margin: '0 0 8px' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 20px' },
  status: { padding: '8px 12px', borderRadius: 6, fontSize: 13, margin: '0 0 16px' },
  ready: { background: '#e8f5e9', color: '#1b5e20' },
  pending: { background: '#f3f3f3', color: '#555' },
  failed: { background: '#fdecea', color: '#8e1c14' },
  controls: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 },
  form: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  input: { padding: '6px 8px', font: 'inherit', width: 180 },
  log: { maxHeight: 460, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 6, background: '#fff' },
  logRow: { display: 'flex', gap: 10, padding: '6px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13 },
  logTime: { color: '#999', fontVariantNumeric: 'tabular-nums', flex: 'none' },
  logType: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minWidth: 0, wordBreak: 'break-word' },
  logDetails: { padding: '0 10px 8px', margin: 0 },
  empty: { color: '#888', fontSize: 13, padding: '10px' },
};

// Enough rows to watch a burst of autocapture without letting a long-lived page grow without bound.
const MAX_LOGGED_EVENTS = 200;

const CUSTOM_EVENT = 'Configurator Test Event';

// Records every event on its way through the pipeline, which is what makes autocapture visible here.
// Enrichment plugins see events after the SDK has built them, so the payload shown is the real one.
function eventLogPlugin(onEvent) {
  return {
    name: 'configurator-event-log',
    type: 'enrichment',
    setup: async () => undefined,
    execute: async (event) => {
      onEvent(event);
      return event;
    },
  };
}

// Guides and Surveys is served per project rather than per version, so its bundle is fetched by API
// key: https://amplitude.com/docs/sdks/guides-and-surveys/sdk. The npm package the ESM snippet imports
// is a loader for that same script and isn't part of this workspace, so the page loads it directly.
function loadEngagementScript(apiKey) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://cdn.amplitude.com/script/${apiKey}.engagement.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No Guides and Surveys bundle for API key ${apiKey}`));
    document.head.appendChild(script);
  });
}

// Same order as the ESM snippet: Guides and Surveys is added before init() so analytics drives its
// setup with an identity already resolved, session replay after, as their docs call for. A plugin that
// won't load is reported as a warning rather than thrown, since analytics is worth running without it.
async function runSdk(state, onEvent) {
  const { apiKey, analytics, sessionReplay, engagement } = buildRuntimeConfig(state);
  const key = apiKey || import.meta.env.VITE_AMPLITUDE_API_KEY || PLACEHOLDER_API_KEY;
  const installed = ['analytics'];
  const warnings = [];

  const amplitude = await import('@amplitude/analytics-browser');
  amplitude.add(eventLogPlugin(onEvent));

  if (engagement) {
    try {
      await loadEngagementScript(key);
      amplitude.add(window.engagement.plugin(engagement));
      installed.push('guides and surveys');
    } catch (error) {
      // A missing bundle is the normal outcome for a placeholder key, and no reason not to run the rest.
      warnings.push(`Guides and Surveys didn't load: ${error.message}`);
    }
  }

  await amplitude.init(key, analytics).promise;

  if (sessionReplay) {
    try {
      const { sessionReplayPlugin } = await import('@amplitude/plugin-session-replay-browser');
      await amplitude.add(sessionReplayPlugin(sessionReplay)).promise;
      installed.push('session replay');
    } catch (error) {
      warnings.push(`Session replay didn't load: ${error.message}`);
    }
  }

  return { amplitude, key, installed, warnings };
}

function EventLog({ events }) {
  if (events.length === 0) {
    return (
      <div style={styles.log}>
        <p style={styles.empty}>Nothing tracked yet. Use the controls above, or click around the page.</p>
      </div>
    );
  }
  return (
    <div style={styles.log}>
      {events.map((entry) => (
        <details key={entry.id}>
          <summary style={styles.logRow}>
            <span style={styles.logTime}>{entry.time}</span>
            <span style={styles.logType}>{entry.type}</span>
          </summary>
          <div style={styles.logDetails}>
            <CodeBlock code={entry.payload} maxHeight={280} />
          </div>
        </details>
      ))}
    </div>
  );
}

// Ordinary page furniture, here so the autocapture options that need something to capture have
// something to capture.
function Sandbox({ onTrack, onFetch, onNavigate }) {
  return (
    <>
      <div style={styles.controls}>
        <Button onClick={onTrack}>Track a custom event</Button>
        <Button onClick={onFetch}>Fetch /api/test</Button>
        <Button onClick={onNavigate}>Change the URL</Button>
      </div>
      <div style={styles.controls}>
        <button type="button" id="plain-button">
          A plain button
        </button>
        <a href="#event-log">A link</a>
        <a href="/configurator/sample-download.csv" download>
          A download
        </a>
      </div>
      <form style={styles.form} onSubmit={(event) => event.preventDefault()}>
        <input style={styles.input} name="favourite-config" placeholder="Type something" autoComplete="off" />
        <button type="submit">Submit a form</button>
      </form>
    </>
  );
}

function Runner() {
  const [snippet, setSnippet] = useState('');
  const [status, setStatus] = useState({ kind: 'pending', message: 'Reading the configuration…' });
  const [events, setEvents] = useState([]);
  // init() is not idempotent, and effects run twice in development.
  const startedRef = useRef(false);
  const nextIdRef = useRef(0);
  const navigationsRef = useRef(0);
  const sdkRef = useRef(null);

  const logEvent = (event) => {
    nextIdRef.current += 1;
    const entry = {
      id: nextIdRef.current,
      time: new Date().toLocaleTimeString(),
      type: event.event_type,
      payload: JSON.stringify(event, null, 2),
    };
    setEvents((previous) => [entry, ...previous].slice(0, MAX_LOGGED_EVENTS));
  };

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    (async () => {
      const state = await decodeStateFromUrl(createDefaultState());
      setSnippet(buildSnippet({ ...state, format: 'esm' }));
      setStatus({ kind: 'pending', message: 'Initialising the SDK…' });
      try {
        const { amplitude, key, installed, warnings } = await runSdk(state, logEvent);
        sdkRef.current = amplitude;
        setStatus({
          kind: 'ready',
          message: `Running ${installed.join(', ')} with API key ${key}.`,
          warnings,
          placeholder: key === PLACEHOLDER_API_KEY,
        });
      } catch (error) {
        setStatus({ kind: 'failed', message: `The SDK failed to start: ${error.message}` });
      }
    })();
  }, []);

  const trackCustomEvent = () => {
    sdkRef.current?.track(CUSTOM_EVENT, { source: 'run page' });
  };

  const fetchTestEndpoint = () => {
    // Nothing reads the response; the point is a request for network tracking to capture.
    fetch('/api/test').catch(() => undefined);
  };

  // A History API change is what page view tracking watches for. Only the fragment moves, so the
  // configuration in the query string survives a reload.
  const changeUrl = () => {
    navigationsRef.current += 1;
    window.history.pushState(
      {},
      '',
      `${window.location.pathname}${window.location.search}#page-${navigationsRef.current}`,
    );
  };

  const statusStyle = { ...styles.status, ...styles[status.kind] };

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Running the configured client</h1>
      <p style={styles.intro}>
        This page initialises <code>@amplitude/analytics-browser</code> from this checkout with the configuration in the
        link, then logs every event the SDK builds.
      </p>
      <div style={styles.toolbar}>
        <a href={`/configurator.html${window.location.search}`}>← Back to the configurator</a>
      </div>
      <p style={statusStyle}>{status.message}</p>
      {status.placeholder ? (
        <Note>
          No API key is configured, so events are built and logged here but Amplitude will reject them. Set one in the
          configurator, or put <code>VITE_AMPLITUDE_API_KEY</code> in <code>.env</code>.
        </Note>
      ) : null}
      {!hasSavedState() ? <Note>The link carries no configuration, so these are the form&apos;s defaults.</Note> : null}
      {(status.warnings ?? []).map((warning) => (
        <Note key={warning}>{warning}</Note>
      ))}
      <div style={styles.layout}>
        <div style={styles.column}>
          <h2 style={styles.sectionHeading}>Sandbox</h2>
          <Card title="Things to capture">
            <Note>
              Each control exercises a different autocapture option, so what shows up in the log depends on what the
              configuration switched on. Network requests are only captured when a rule matches: by default that is
              status codes 500-599, so <code>/api/test</code> needs a rule to appear.
            </Note>
            <Sandbox onTrack={trackCustomEvent} onFetch={fetchTestEndpoint} onNavigate={changeUrl} />
          </Card>
          <h2 style={styles.sectionHeading} id="event-log">
            Event log
          </h2>
          <Note>Newest first. Expand a row for the full payload the SDK would send.</Note>
          <EventLog events={events} />
        </div>
        <div style={styles.outputColumn}>
          <h2 style={styles.sectionHeading}>What this page is running</h2>
          <Note>
            The same ESM code the configurator generates for this configuration. Guides and Surveys is the one
            difference: the page loads its per-project bundle from the CDN, which is what that npm import wraps.
          </Note>
          <CodeBlock code={snippet} maxHeight="60vh" />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Runner />);
