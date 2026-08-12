// How to get hold of the extension "Run on URL" needs. It isn't in the Chrome Web Store, so there is no
// install link to point at: the steps are the download this server builds, and Load unpacked. They mirror
// test-server/configurator-extension/README.md, which is the fuller account.
import React from 'react';
import { CodeBlock, Panel } from './components.jsx';

const EXTENSION_DIRECTORY = 'test-server/configurator-extension';

const REPOSITORY_URL = `https://github.com/amplitude/Amplitude-TypeScript/tree/main/${EXTENSION_DIRECTORY}`;

// Built by test-server/extension-archive.js, which owns this path, out of the extension directory as it
// stands in whatever checkout is serving this page.
const ARCHIVE_URL = '/configurator-extension.zip';

// The folder the archive holds, which is also the folder to load from a checkout, so the last two steps
// read the same either way.
const UNPACKED_FOLDER = 'configurator-extension';

// The bundles the extension injects aren't checked in. The archive carries them already; a checkout has
// to build them before Chrome will accept the folder.
const SETUP_COMMANDS = `pnpm --dir packages/analytics-browser build
pnpm --dir packages/plugin-session-replay-browser build
node ${EXTENSION_DIRECTORY}/sync-vendor.mjs`;

const styles = {
  wrapper: { maxWidth: 760, margin: '0 0 20px' },
  note: { color: '#888', fontSize: 12, margin: '0 0 10px' },
  steps: { margin: '0 0 10px', paddingLeft: 20, fontSize: 13, color: '#444', lineHeight: 1.6 },
  step: { marginBottom: 6 },
  commands: { margin: '8px 0 4px' },
};

export function RunnerExtensionPanel({ version }) {
  return (
    <div style={styles.wrapper}>
      <Panel
        title="Run on URL needs the runner extension"
        badge={version ? `installed · ${version}` : 'not detected on this page'}
      >
        <p style={styles.note}>
          The extension isn&apos;t in the Chrome Web Store, so Chrome will only take it as an unpacked folder. This
          server builds that folder into an archive for you, SDK bundles included.
        </p>
        <ol style={styles.steps}>
          <li style={styles.step}>
            Download{' '}
            <a href={ARCHIVE_URL} download>
              <code>configurator-extension.zip</code>
            </a>
            , built from the checkout serving this page, so it matches the SDK it configures.
          </li>
          <li style={styles.step}>
            Unzip it. That leaves one <code>{UNPACKED_FOLDER}</code> folder — keep it somewhere it can stay, since
            Chrome loads the extension from where it sits rather than copying it.
          </li>
          <li style={styles.step}>
            Open <code>chrome://extensions</code> — paste it into the address bar, since Chrome won&apos;t follow a link
            there — and turn on Developer mode.
          </li>
          <li style={styles.step}>
            Click Load unpacked and choose that <code>{UNPACKED_FOLDER}</code> folder.
          </li>
          <li style={styles.step}>
            Reload this page. The extension attaches to it as it loads, so a page open from before the install
            can&apos;t see it.
          </li>
        </ol>
      </Panel>
    </div>
  );
}
