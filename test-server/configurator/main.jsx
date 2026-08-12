import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, CheckboxField, CodeBlock, SelectField, TextField } from './components.jsx';
import { AutocapturePanel } from './autocapture-panel.jsx';
import { SectionPanels } from './section-panels.jsx';
import { CONFIG_SECTIONS, SHARED_CONFIG_OPTIONS, TOP_LEVEL_CONFIG_OPTIONS } from './config-options.js';
import { ENGAGEMENT_SECTIONS } from './engagement-options.js';
import { SESSION_REPLAY_SECTIONS, TOP_LEVEL_SESSION_REPLAY_OPTIONS } from './session-replay-options.js';
import { createDefaultState } from './default-state.js';
import { OptionField } from './option-field.jsx';
import { decodeStateFromUrl, encodeStateToUrl, hasSavedState } from './share-link.js';
import { buildSnippet, SNIPPET_FORMATS, snippetLanguage } from './snippet.js';

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
  // The API key belongs to both sections below, so it sits above the first rule.
  formSection: { borderTop: '1px solid #e5e5e5', paddingTop: 16, marginTop: 20 },
  toolbar: { display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 20px' },
  toolbarNote: { color: '#888', fontSize: 12 },
};

// Lines up the labels of the handful of fields sitting above the panels.
const TOP_LABEL_WIDTH = 100;

const DEFAULT_STATE = createDefaultState();

// Sibling page that initialises the SDK with whatever the link carries.
const RUN_PAGE = '/configurator-run.html';

function Configurator({ initialState }) {
  const [apiKey, setApiKey] = useState(initialState.apiKey);
  const [format, setFormat] = useState(initialState.format);
  const [configOptions, setConfigOptions] = useState(initialState.configOptions);
  const [autocapture, setAutocapture] = useState(initialState.autocapture);
  // Kept when autocapture is switched off so the selections come back on re-enable.
  const [autocaptureOptions, setAutocaptureOptions] = useState(initialState.autocaptureOptions);
  const [autocaptureSubOptions, setAutocaptureSubOptions] = useState(initialState.autocaptureSubOptions);
  const [sessionReplay, setSessionReplay] = useState(initialState.sessionReplay);
  const [sessionReplayOptions, setSessionReplayOptions] = useState(initialState.sessionReplayOptions);
  const [engagement, setEngagement] = useState(initialState.engagement);
  const [engagementOptions, setEngagementOptions] = useState(initialState.engagementOptions);
  const [savedState, setSavedState] = useState(null);
  const [copied, setCopied] = useState(false);
  const [blockedRunUrl, setBlockedRunUrl] = useState(null);

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
    configOptions,
    autocapture,
    autocaptureOptions,
    autocaptureSubOptions,
    sessionReplay,
    sessionReplayOptions,
    engagement,
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

          <section style={styles.formSection}>
            <h2 style={styles.sectionHeading}>Session Replay</h2>

            <CheckboxField
              id="session-replay"
              label="Enabled"
              labelWidth={TOP_LABEL_WIDTH}
              checked={sessionReplay}
              onChange={setSessionReplay}
              description="Installs the session replay plugin alongside the analytics SDK."
            />
            {sessionReplay ? (
              <>
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
              </>
            ) : null}
          </section>

          <section style={styles.formSection}>
            <h2 style={styles.sectionHeading}>Guides and Surveys</h2>

            <CheckboxField
              id="engagement"
              label="Enabled"
              labelWidth={TOP_LABEL_WIDTH}
              checked={engagement}
              onChange={setEngagement}
              description="Installs the Guides and Surveys plugin alongside the analytics SDK."
            />
            {engagement ? (
              <SectionPanels
                sections={ENGAGEMENT_SECTIONS}
                values={engagementOptions}
                onChange={setEngagementOption}
                idPrefix="engagement"
              />
            ) : null}
          </section>
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
