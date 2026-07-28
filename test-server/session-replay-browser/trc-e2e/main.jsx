import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom';
import * as amplitude from '@amplitude/analytics-browser';
import * as sessionReplay from '@amplitude/plugin-session-replay-browser';

// Targeted Recording (TRC) e2e harness. Drives @amplitude/analytics-browser + the SR plugin against
// real remote config, so you can reproduce/verify URL-targeting behavior end to end.
//
// Two build modes, selected by the SR_MODE env var at vite startup (see vite.config.js):
//   - local (default, `pnpm dev:trc`): bundles the workspace builds in packages/*.
//   - npm (`pnpm dev:trc:npm`):         bundles the published packages pinned in root package.json
//                                       under the *-srnpm npm: aliases.
const SR_MODE = import.meta.env.SR_MODE === 'npm' ? 'npm' : 'local';

// Expose for console poking (e.g. window.amplitude.getDeviceId()).
window.amplitude = amplitude;
window.sessionReplay = sessionReplay;

// The dedicated vite config serves this app at the server root (appType: 'spa'), so react-router
// routes hang directly off '/'.
const BASENAME = '/';

// In plugin mode the diagnostics client is internal to the SDK, so we can't inject a spy. Instead we
// intercept fetch and surface the real POSTs to .../v1/capture — that's the actual diagnostics
// payload (counters/histograms/events) the SDK ships. Install before init().
//
// Patch window.fetch exactly once and route to the latest sink, so a retried Start (after a failed
// init) doesn't stack wrappers and double-count captures.
let captureSink = null;
let fetchPatched = false;
function installCaptureInterceptor(onCapture) {
  captureSink = onCapture;
  if (fetchPatched) {
    return;
  }
  fetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    if (url.includes('/v1/capture')) {
      try {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        captureSink?.({ url, body, at: new Date().toLocaleTimeString() });
      } catch {
        captureSink?.({ url, body: undefined, at: new Date().toLocaleTimeString() });
      }
    }
    return orig(input, init);
  };
}

// Routes to exercise URL targeting. Whether each records depends on YOUR project's TRC rules.
// `/settings/price-plan/details` is included because URL-contains rules are the common case.
const ROUTES = [
  { path: '/', label: 'Home' },
  { path: '/overview', label: '/overview' },
  { path: '/settings/price-plan/details', label: '/settings/price-plan/details' },
  { path: '/products/42', label: '/products/:id' },
];

function Page({ title }) {
  const { id } = useParams();
  return (
    <div>
      <h2>{title}</h2>
      <p>
        URL the SDK now sees: <code>{window.location.href}</code>
      </p>
      {id && <p>route param id = {id}</p>}
      <p>SPA navigation (no reload) fires URL-change targeting re-eval; tracked events also trigger eval.</p>
      <button onClick={() => amplitude.track('manual_test_event', { from: title })}>
        amplitude.track(&apos;manual_test_event&apos;)
      </button>
    </div>
  );
}

function Nav() {
  const navigate = useNavigate();
  const [freePath, setFreePath] = useState('/settings/price-plan/details');
  return (
    <nav style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 8 }}>
        {ROUTES.map((r) => (
          <NavLink
            key={r.path}
            to={r.path}
            end={r.path === '/'}
            style={({ isActive }) => ({ marginRight: 12, fontWeight: isActive ? 'bold' : 'normal' })}
          >
            {r.label}
          </NavLink>
        ))}
      </div>
      <div>
        <button onClick={() => navigate(-1)}>← Back</button>
        <button onClick={() => navigate(1)} style={{ marginRight: 16 }}>
          Forward →
        </button>
        <input
          type="text"
          value={freePath}
          onChange={(e) => setFreePath(e.target.value)}
          style={{ width: 280, padding: 4 }}
        />
        <button onClick={() => navigate(freePath)}>go (pushState)</button>
        <button onClick={() => navigate(freePath, { replace: true })}>go (replaceState)</button>
      </div>
    </nav>
  );
}

function ModeBadge() {
  const isNpm = SR_MODE === 'npm';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 'bold',
        color: '#fff',
        background: isNpm ? '#6b46c1' : '#2b6cb0',
      }}
    >
      {isNpm ? 'NPM (published)' : 'LOCAL (workspace build)'}
    </span>
  );
}

function ConfigForm({ onStart }) {
  const params = new URLSearchParams(window.location.search);
  const [apiKey, setApiKey] = useState(params.get('apiKey') ?? '');
  const [serverZone, setServerZone] = useState(params.get('serverZone') ?? 'US');
  const [logLevel, setLogLevel] = useState(params.get('logLevel') ?? '4');
  const [enablePolling, setEnablePolling] = useState(params.get('polling') !== '0');
  const [pollingInterval, setPollingInterval] = useState(params.get('pollingInterval') ?? '');
  const [error, setError] = useState('');

  const start = async () => {
    if (!apiKey.trim()) {
      setError('enter an API key');
      return;
    }
    setError('');
    await onStart({
      apiKey: apiKey.trim(),
      serverZone,
      logLevel: Number(logLevel),
      enablePolling,
      pollingInterval: pollingInterval.trim() ? Number(pollingInterval) : undefined,
    });
  };

  const field = { display: 'block', margin: '6px 0' };
  return (
    <div>
      <p style={{ marginBottom: 12 }}>
        Mode: <ModeBadge /> &nbsp;
        <span style={{ color: '#888', fontSize: 13 }}>
          (switch with <code>pnpm dev:trc</code> vs <code>pnpm dev:trc:npm</code>)
        </span>
      </p>
      <p>
        Drives <code>@amplitude/analytics-browser</code> + <code>@amplitude/plugin-session-replay-browser</code> against
        real remote config. Diagnostics flow through the SDK&apos;s DiagnosticsClient; this page surfaces the real{' '}
        <code>/v1/capture</code> POSTs below.
      </p>
      <label style={field}>
        API Key{' '}
        <input
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ width: 360, padding: 4 }}
          placeholder="your project API key"
        />
      </label>
      <label style={field}>
        Server Zone{' '}
        <select value={serverZone} onChange={(e) => setServerZone(e.target.value)}>
          <option value="US">US</option>
          <option value="EU">EU</option>
        </select>
      </label>
      <label style={field}>
        Log Level{' '}
        <select value={logLevel} onChange={(e) => setLogLevel(e.target.value)}>
          <option value="4">4 = DEBUG</option>
          <option value="3">3 = WARN</option>
          <option value="0">0 = NONE</option>
        </select>
      </label>
      <label style={field}>
        <input type="checkbox" checked={enablePolling} onChange={(e) => setEnablePolling(e.target.checked)} /> Enable URL
        change polling{' '}
        <span style={{ color: '#888' }}>(re-evaluate TRC on URL changes even when the SPA bypasses the History API)</span>
      </label>
      <label style={field}>
        Polling interval (ms){' '}
        <input
          type="number"
          value={pollingInterval}
          onChange={(e) => setPollingInterval(e.target.value)}
          disabled={!enablePolling}
          style={{ width: 120, padding: 4 }}
          placeholder="default 1000"
        />
      </label>
      <button onClick={start} style={{ padding: '6px 12px', marginTop: 8 }}>
        Start (init analytics + SR plugin)
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}

function CapturePanel({ captures, onClear }) {
  // Aggregate counters across all capture POSTs; flatten events (each carries srId in event_properties).
  const counters = {};
  const events = [];
  for (const c of captures) {
    const body = c.body ?? {};
    for (const [k, v] of Object.entries(body.counters ?? {})) {
      counters[k] = (counters[k] || 0) + (typeof v === 'number' ? v : 0);
    }
    for (const e of body.events ?? []) {
      events.push({ at: c.at, ...e });
    }
  }
  return (
    <div style={{ border: '1px solid #bbb', borderRadius: 6, padding: 12, marginBottom: 16, background: '#fafafe' }}>
      <strong>Diagnostics captures</strong> — real POSTs to <code>/v1/capture</code> ({captures.length}){' '}
      <button onClick={onClear}>clear</button>
      <div style={{ marginTop: 8 }}>
        <em>counters (summed across POSTs)</em>
        <pre style={{ margin: '4px 0', fontSize: 12 }}>
          {Object.keys(counters).length ? JSON.stringify(counters, null, 2) : '— (waiting for a capture POST)'}
        </pre>
        <em>events (event_name · variant/trigger · srId)</em>
        <pre style={{ margin: '4px 0', fontSize: 12, maxHeight: 240, overflow: 'auto' }}>
          {events.length
            ? events
                .map((e) => {
                  const p = e.event_properties ?? {};
                  const extra = p.variantKey ?? p.trigger ?? (p.matched != null ? `matched=${String(p.matched)}` : '');
                  return `${e.time ?? e.at}  ${e.event_name}  ${extra}  [srId=${p.srId ?? '—'}]`;
                })
                .join('\n')
            : '—'}
        </pre>
      </div>
    </div>
  );
}

function App() {
  const [started, setStarted] = useState(false);
  const [sessionInfo, setSessionInfo] = useState('');
  const [captures, setCaptures] = useState([]);
  const initedRef = useRef(false);

  const handleStart = async (opts) => {
    if (initedRef.current) return;
    initedRef.current = true;
    try {
      // Surface real /v1/capture POSTs (install before init so init-time flushes are caught).
      installCaptureInterceptor((cap) => setCaptures((prev) => [...prev, cap]));

      // The analytics SDK's own diagnostics default to sampleRate 0; sample them in if supported.
      // (The SR plugin creates its own Debug-gated diagnostics client regardless.)
      amplitude._setDiagnosticsSampleRate?.(1);

      amplitude.add(
        sessionReplay.plugin({
          performanceConfig: { timeout: 1000 },
          storeType: 'memory',
          useWebWorker: true,
          enableUrlChangePolling: opts.enablePolling,
          ...(opts.pollingInterval ? { urlChangePollingInterval: opts.pollingInterval } : {}),
        }),
      );

      await amplitude.init(opts.apiKey, undefined, {
        logLevel: opts.logLevel,
        serverZone: opts.serverZone,
        defaultTracking: { sessions: true, pageViews: true, formInteractions: false, fileDownloads: false },
      }).promise;

      setSessionInfo(
        `zone ${opts.serverZone} · session ${String(amplitude.getSessionId?.())} · polling ${
          opts.enablePolling ? `on${opts.pollingInterval ? ` (${opts.pollingInterval}ms)` : ''}` : 'off'
        }`,
      );
      setStarted(true);
    } catch (err) {
      initedRef.current = false;
      window.srError = err.message;
      // eslint-disable-next-line no-alert
      alert('init failed: ' + err.message);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>
      <h1>Session Replay — URL TRC e2e harness</h1>
      {!started ? (
        <ConfigForm onStart={handleStart} />
      ) : (
        <>
          <p style={{ color: '#666' }}>
            <ModeBadge /> &nbsp; {sessionInfo} — open DevTools console (log level 4) and Network (filter{' '}
            <code>capture</code>) to watch diagnostics flow.
          </p>
          <CapturePanel captures={captures} onClear={() => setCaptures([])} />
          <Nav />
          <Routes>
            <Route path="/" element={<Page title="Home" />} />
            <Route path="/overview" element={<Page title="Overview" />} />
            <Route path="/settings/price-plan/details" element={<Page title="Price plan details" />} />
            <Route path="/products/:id" element={<Page title="Product" />} />
            <Route path="*" element={<Page title="Catch-all route" />} />
          </Routes>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={BASENAME}>
    <App />
  </BrowserRouter>,
);
