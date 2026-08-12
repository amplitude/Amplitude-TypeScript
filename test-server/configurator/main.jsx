import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, CheckboxField, CheckboxGroup, CodeBlock, Panel, SelectField, TextField } from './components.jsx';
import { AutocapturePanel } from './autocapture-panel.jsx';
import { SectionPanels } from './section-panels.jsx';
import { BLADES } from './blades.js';
import { CONFIG_SECTIONS, SHARED_CONFIG_OPTIONS, TOP_LEVEL_CONFIG_OPTIONS } from './config-options.js';
import { ENGAGEMENT_SECTIONS } from './engagement-options.js';
import { SESSION_REPLAY_SECTIONS, TOP_LEVEL_SESSION_REPLAY_OPTIONS } from './session-replay-options.js';
import { createDefaultState } from './default-state.js';
import { OptionField } from './option-field.jsx';
import { RunnerExtensionPanel } from './runner-extension-panel.jsx';
import { decodeStateFromUrl, encodeStateToUrl, hasSavedState } from './share-link.js';
import { requestRun, toJsonSafe, useExtensionVersion } from './extension-bridge.js';
import { buildRuntimeConfig } from './runtime-config.js';
import { buildSnippet, PLACEHOLDER_API_KEY, SNIPPET_FORMATS, snippetLanguage } from './snippet.js';

const styles = {
  page: { fontFamily: 'system-ui, sans-serif', maxWidth: 1400, margin: '48px auto', padding: '0 16px' },
  heading: { marginBottom: 8 },
  intro: { color: '#666', marginTop: 0 },
  // Two columns that collapse to one when the viewport can't fit both, no media query needed: each
  // column asks for its basis width and wraps once there isn't room.
  layout: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 },
  configColumn: { flex: '1 1 520px', minWidth: 0 },
  // Sticks alongside the config column, which is far taller once a few panels are open.
  outputColumn: { flex: '1 1 400px', minWidth: 0, position: 'sticky', top: 24 },
  sectionHeading: { fontSize: 16, margin: '0 0 8px' },
  // The API key, the shared options and the blade picker belong to every blade, so they sit above the
  // first rule.
  formSection: { borderTop: '1px solid #e5e5e5', paddingTop: 16, marginTop: 20 },
  toolbar: { display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 20px' },
  toolbarNote: { color: '#888', fontSize: 12 },
  // Matches the width the install panel below it sits at, so the two read as one column.
  runPanel: { maxWidth: 760 },
  runActions: { display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px' },
};

// Lines up the labels of the handful of fields sitting above the panels.
const TOP_LABEL_WIDTH = 100;

// Wider than the fields below, because "Mock Referrer" is longer than anything the SDK's own options are
// called.
const RUN_LABEL_WIDTH = 110;

const DEFAULT_STATE = createDefaultState();

// Sibling page that initialises the SDK with whatever the link carries.
const RUN_PAGE = '/configurator-run.html';

function Configurator({ initialState }) {
  const [apiKey, setApiKey] = useState(initialState.apiKey);
  const [format, setFormat] = useState(initialState.format);
  // Which of the optional blades are switched on, read out of the state by the keys BLADES names so the
  // picker and the sections it gates can't drift apart. Analytics is required, so it isn't in here and
  // its section is always rendered. Each blade's own options live on below whether it is on or not, so
  // switching one off and back on doesn't cost the configuration that was built for it.
  const [blades, setBlades] = useState(() =>
    Object.fromEntries(BLADES.filter((blade) => !blade.required).map(({ key }) => [key, initialState[key]])),
  );
  const [configOptions, setConfigOptions] = useState(initialState.configOptions);
  const [autocapture, setAutocapture] = useState(initialState.autocapture);
  // Kept when autocapture is switched off so the selections come back on re-enable.
  const [autocaptureOptions, setAutocaptureOptions] = useState(initialState.autocaptureOptions);
  const [autocaptureSubOptions, setAutocaptureSubOptions] = useState(initialState.autocaptureSubOptions);
  const [sessionReplayOptions, setSessionReplayOptions] = useState(initialState.sessionReplayOptions);
  const [engagementOptions, setEngagementOptions] = useState(initialState.engagementOptions);
  const [savedState, setSavedState] = useState(null);
  const [copied, setCopied] = useState(false);
  const [blockedRunUrl, setBlockedRunUrl] = useState(null);
  const [targetUrl, setTargetUrl] = useState(initialState.targetUrl);
  const [mockReferrer, setMockReferrer] = useState(initialState.mockReferrer);
  const [clearSession, setClearSession] = useState(initialState.clearSession);
  const [targetNote, setTargetNote] = useState(null);
  // Running on another site is the extension's to do, so without it that button has nothing behind it.
  const runnerVersion = useExtensionVersion();

  const setBlade = (key, value) => {
    setBlades((previous) => ({ ...previous, [key]: value }));
  };

  const setConfigOption = (key, value) => {
    setConfigOptions((previous) => ({ ...previous, [key]: value }));
  };

  const setSessionReplayOption = (key, value) => {
    setSessionReplayOptions((previous) => ({ ...previous, [key]: value }));
  };

  const setEngagementOption = (key, value) => {
    setEngagementOptions((previous) => ({ ...previous, [key]: value }));
  };

  const setAutocaptureOption = (key, value) => {
    setAutocaptureOptions((previous) => ({ ...previous, [key]: value }));
  };

  const updateAutocaptureSubOptions = (parentKey, value) => {
    setAutocaptureSubOptions((previous) => ({ ...previous, [parentKey]: value }));
  };

  const state = {
    apiKey,
    format,
    targetUrl,
    mockReferrer,
    clearSession,
    ...blades,
    configOptions,
    autocapture,
    autocaptureOptions,
    autocaptureSubOptions,
    sessionReplayOptions,
    engagementOptions,
  };

  // Comparing against the state that was saved means the confirmation goes away by itself as soon as
  // anything is edited again.
  const isSaved = savedState !== null && JSON.stringify(savedState) === JSON.stringify(state);

  const copyLink = async () => {
    const url = await encodeStateToUrl(state, DEFAULT_STATE);
    window.history.replaceState(null, '', url);
    setSavedState(state);
    // The clipboard is unavailable outside a secure context, which this page often is when it's
    // served to another device on the network, so the address bar is the fallback.
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch (error) {
      console.warn('Could not copy the URL to the clipboard', error);
      setCopied(false);
    }
  };

  // The run page reads the same link the copy button writes, so running is a matter of pointing a new
  // tab at it. The tab is opened before the state is encoded, because awaiting first spends the click
  // that lets a pop-up through.
  const run = async () => {
    const tab = window.open('', '_blank');
    const url = await encodeStateToUrl(state, DEFAULT_STATE, new URL(RUN_PAGE, window.location.href).toString());
    if (tab) {
      tab.location = url;
      setBlockedRunUrl(null);
    } else {
      setBlockedRunUrl(url);
    }
  };

  // Running on a site this page has no access to takes the extension: it opens the tab and injects the
  // SDK into it. The configuration is materialised here, where the schemas live, and travels as JSON.
  // Nothing here checks that the extension is present, because the button is disabled until it is.
  const runOnUrl = async () => {
    // The address bar is where this form keeps everything else, so the site being tested is kept there
    // too: reloading, or coming back to the link later, reopens with it still filled in.
    window.history.replaceState(null, '', await encodeStateToUrl(state, DEFAULT_STATE));
    const { apiKey: key, analytics, sessionReplay: replay, engagement: guides } = buildRuntimeConfig(state);
    setTargetNote('Opening…');
    try {
      const result = await requestRun({
        url: targetUrl.trim(),
        // Left off entirely when blank, so the extension can tell "don't touch document.referrer" from
        // "make it read empty", which is what arriving with no referrer at all looks like.
        mockReferrer: mockReferrer.trim() || undefined,
        clearSession,
        apiKey: key || PLACEHOLDER_API_KEY,
        analytics: toJsonSafe(analytics),
        sessionReplay: toJsonSafe(replay),
        engagement: guides,
      });
      setTargetNote(result.message);
    } catch (error) {
      // Named with the version that produced it: the extension is loaded unpacked from a working copy, so
      // "it still says the same thing" is as likely to be a copy that was never reloaded as a real failure.
      setTargetNote(`${error.message} (runner ${runnerVersion})`);
    }
  };

  let linkNote =
    'Copy this configuration as a link to bookmark or share, or run it in a new tab with the SDK initialised.';
  if (isSaved) {
    linkNote = copied
      ? 'Copied to your clipboard, and saved to the address bar.'
      : 'Saved to the address bar — the clipboard was unavailable, so copy it from there.';
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.heading}>Amplitude Browser Client Configurator</h1>
      <p style={styles.intro}>
        Build an <code>amplitude.init()</code> call. Only options you change from their SDK default are included.
      </p>

      <div style={styles.toolbar}>
        <Button onClick={copyLink}>Copy Link</Button>
        <Button onClick={run}>Run</Button>
        {blockedRunUrl ? (
          <span style={styles.toolbarNote}>
            A pop-up blocker stopped the new tab —{' '}
            <a href={blockedRunUrl} target="_blank" rel="noreferrer">
              open the run page
            </a>
            .
          </span>
        ) : (
          <span style={styles.toolbarNote}>{linkNote}</span>
        )}
      </div>

      {/* Its own panel because none of it is configuration: every field here describes the tab the SDK is
          injected into rather than the SDK, so none of it appears in the generated snippet. */}
      <div style={styles.runPanel}>
        <Panel
          title="Run on URL"
          badge={runnerVersion ? `runner ${runnerVersion}` : 'runner not detected'}
          description="Runs this configuration on another site, through the runner extension. These fields set up the tab the SDK is injected into, so none of them reach the generated snippet."
          defaultOpen
        >
          <TextField
            id="target-url"
            label="Target URL"
            labelWidth={RUN_LABEL_WIDTH}
            type="url"
            value={targetUrl}
            onChange={setTargetUrl}
            placeholder="https://example.com"
            description="The site to open and instrument. It rides along in the link, so reopening one doesn't cost the site the configuration was last tried on."
          />
          <TextField
            id="mock-referrer"
            label="Mock Referrer"
            labelWidth={RUN_LABEL_WIDTH}
            type="url"
            value={mockReferrer}
            onChange={setMockReferrer}
            placeholder="https://google.com"
            hint="optional"
            description="Makes document.referrer read this on the page the run opens with, so attribution sees it as the referring page. Pages navigated to afterwards report their real referrer, the way a second pageview would. Only the JS view moves — the request that fetched the page carried whatever Referer the browser chose."
          />
          <CheckboxField
            id="clear-session"
            label="Clean Session"
            labelWidth={RUN_LABEL_WIDTH}
            checked={clearSession}
            onChange={setClearSession}
            description="Deletes Amplitude's stored cookies and web storage for the site before the run starts, so it begins with a new device ID, a new session and no prior attribution. Once per run, not on every page."
          />
          <div style={styles.runActions}>
            <Button
              onClick={runOnUrl}
              disabled={!runnerVersion}
              // Named with the origin, because an extension that is installed but doesn't list this host is
              // as common a reason for the button being dead as not having installed it at all.
              title={
                runnerVersion
                  ? undefined
                  : `No runner extension on ${window.location.origin}. See the install steps below.`
              }
            >
              Run on URL
            </Button>
            {/* Only after a click: what this panel is for is said in its description, and repeating it here
                would leave nowhere for the answer to appear. */}
            {targetNote ? <span style={styles.toolbarNote}>{targetNote}</span> : null}
          </div>
        </Panel>
      </div>

      <RunnerExtensionPanel version={runnerVersion} />

      <div style={styles.layout}>
        <div style={styles.configColumn}>
          <TextField
            id="api-key"
            label="API Key"
            labelWidth={TOP_LABEL_WIDTH}
            value={apiKey}
            onChange={setApiKey}
            placeholder="your project API key"
            description="Your Amplitude Project API key."
          />
          {SHARED_CONFIG_OPTIONS.map((field) => (
            <OptionField
              key={field.key}
              id={`config-${field.key}`}
              field={field}
              value={configOptions[field.key]}
              onChange={(value) => setConfigOption(field.key, value)}
              labelWidth={TOP_LABEL_WIDTH}
            />
          ))}
          <CheckboxGroup
            id="blade"
            label="Blades"
            labelWidth={TOP_LABEL_WIDTH}
            description="The Amplitude products this client is for. Only the blades you pick are configured below."
            options={BLADES}
            values={blades}
            onChange={setBlade}
          />

          <section style={styles.formSection}>
            <h2 style={styles.sectionHeading}>Analytics</h2>

            {TOP_LEVEL_CONFIG_OPTIONS.map((field) => (
              <OptionField
                key={field.key}
                id={`config-${field.key}`}
                field={field}
                value={configOptions[field.key]}
                onChange={(value) => setConfigOption(field.key, value)}
                labelWidth={TOP_LABEL_WIDTH}
              />
            ))}

            <CheckboxField
              id="autocapture"
              label="Autocapture"
              labelWidth={TOP_LABEL_WIDTH}
              checked={autocapture}
              onChange={setAutocapture}
              description="The configurations for auto-captured events."
            />
            {autocapture ? (
              <AutocapturePanel
                values={autocaptureOptions}
                onChange={setAutocaptureOption}
                subValues={autocaptureSubOptions}
                onSubChange={updateAutocaptureSubOptions}
              />
            ) : null}

            <SectionPanels
              sections={CONFIG_SECTIONS}
              values={configOptions}
              onChange={setConfigOption}
              idPrefix="config"
            />
          </section>

          {blades.sessionReplay ? (
            <section style={styles.formSection}>
              <h2 style={styles.sectionHeading}>Session Replay</h2>

              {TOP_LEVEL_SESSION_REPLAY_OPTIONS.map((field) => (
                <OptionField
                  key={field.key}
                  id={`session-replay-${field.key}`}
                  field={field}
                  value={sessionReplayOptions[field.key]}
                  onChange={(value) => setSessionReplayOption(field.key, value)}
                  labelWidth={TOP_LABEL_WIDTH}
                />
              ))}

              <SectionPanels
                sections={SESSION_REPLAY_SECTIONS}
                values={sessionReplayOptions}
                onChange={setSessionReplayOption}
                idPrefix="session-replay"
              />
            </section>
          ) : null}

          {blades.engagement ? (
            <section style={styles.formSection}>
              <h2 style={styles.sectionHeading}>Guides and Surveys</h2>

              <SectionPanels
                sections={ENGAGEMENT_SECTIONS}
                values={engagementOptions}
                onChange={setEngagementOption}
                idPrefix="engagement"
              />
            </section>
          ) : null}
        </div>

        <div style={styles.outputColumn}>
          <h2 style={styles.sectionHeading}>Generated code</h2>
          <SelectField
            id="snippet-format"
            label="Format"
            labelWidth={60}
            value={format}
            onChange={setFormat}
            choices={SNIPPET_FORMATS}
            allowUnset={false}
          />
          <CodeBlock code={buildSnippet(state)} language={snippetLanguage(format)} maxHeight="calc(100vh - 180px)" />
        </div>
      </div>
    </main>
  );
}

// Reading a saved link means decompressing it, which is async, so the form waits for that rather than
// mounting with its defaults and rewriting them a moment later. Without a link there is nothing to
// wait for, so the common case still renders on the first pass.
function App() {
  const [initialState, setInitialState] = useState(() => (hasSavedState() ? null : createDefaultState()));

  useEffect(() => {
    if (initialState === null) {
      void decodeStateFromUrl(createDefaultState()).then(setInitialState);
    }
  }, [initialState]);

  return initialState === null ? null : <Configurator initialState={initialState} />;
}

createRoot(document.getElementById('root')).render(<App />);
