// Decides which tabs get instrumented, and injects the SDK into them.
//
// Injection happens on webNavigation.onCommitted rather than through a registered content script,
// because a registered script can't be handed anything: this has to carry a configuration, and
// executeScript(func, args) is the only injection that takes arguments. The cost is timing — onCommitted
// with injectImmediately lands before the page's own scripts, but a little later than a document_start
// registration would. If catching the very first request ever matters more than being configurable,
// register instead and bake the configuration into a file.
//
// Two things stay true either way, and both matter:
//   world: 'MAIN'  the SDK shares globals with the page, so it sees the page's own fetch, XHR and
//                  history. In an isolated world those patches would apply to nothing.
//   top frame only for now, so a page full of iframes doesn't get an instance per frame.
import { cspReport, relaxCsp, restoreCsp } from './csp.js';

const SDK_BUNDLE = 'vendor/amplitude-min.js';
const SESSION_REPLAY_BUNDLE = 'vendor/plugin-session-replay-browser-min.js';

const TABS_KEY = 'instrumentedTabs';
const LAST_PAYLOAD_KEY = 'lastPayload';

// What the configurator sends when no API key has been typed in — PLACEHOLDER_API_KEY in its snippet.js.
const PLACEHOLDER_API_KEY = 'YOUR_API_KEY';

// What the toolbar button uses before the configurator has sent anything.
const FALLBACK_PAYLOAD = {
  apiKey: 'REPLACE_WITH_A_SCRATCH_PROJECT_KEY',
  analytics: {
    logLevel: 4,
    autocapture: {
      attribution: true,
      fileDownloads: true,
      formInteractions: true,
      pageViews: true,
      sessions: true,
      elementInteractions: true,
      frustrationInteractions: true,
      // The default only captures 500-599, which makes a healthy site look like nothing is working.
      networkTracking: { captureRules: [{ hosts: ['*'], statusCodeRange: '200-599' }] },
      webVitals: true,
    },
  },
  sessionReplay: null,
  engagement: null,
};

async function instrumentedTabs() {
  const { [TABS_KEY]: tabs = {} } = await chrome.storage.session.get(TABS_KEY);
  return tabs;
}

// Both transitions carry the CSP rule with them, so no path can mark a tab and forget to clear the way for
// what the SDK is about to do — or leave a tab unprotected after instrumentation stops.
async function instrument(tabId, payload) {
  const tabs = await instrumentedTabs();
  await chrome.storage.session.set({ [TABS_KEY]: { ...tabs, [tabId]: payload } });
  await relaxCsp(tabId);
  await chrome.action.setBadgeText({ tabId, text: 'on' });
}

async function forget(tabId) {
  const tabs = await instrumentedTabs();
  delete tabs[tabId];
  await chrome.storage.session.set({ [TABS_KEY]: tabs });
  await restoreCsp(tabId);
}

// Runs in the page before the SDK bundle: saves what the page had under window.amplitude, since the
// bundle is about to write over it, and leaves the configuration where inject.js will look for it.
function handOver(payload, csp) {
  window.__amplitudeConfigurator = {
    hadGlobal: 'amplitude' in window,
    properties: window.amplitude ? { ...window.amplitude } : undefined,
    payload,
    csp,
  };
}

chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0 || !url.startsWith('http')) {
    return;
  }
  const payload = (await instrumentedTabs())[tabId];
  if (!payload) {
    return;
  }
  // Read before injecting: by the time a navigation commits the response headers have arrived, which is
  // where the policy the page was sent is still visible.
  const csp = cspReport(tabId, payload);
  if (csp) {
    await chrome.action.setTitle({ tabId, title: csp.summary });
  }
  const target = { tabId };
  const inject = (options) =>
    chrome.scripting.executeScript({ target, world: 'MAIN', injectImmediately: true, ...options });
  try {
    await inject({ func: handOver, args: [payload, csp] });
    await inject({ files: [SDK_BUNDLE] });
    if (payload.sessionReplay) {
      // Its own call: a plugin bundle that won't load shouldn't stop analytics from running, and
      // inject.js reports the gap when the global it expects isn't there.
      try {
        await inject({ files: [SESSION_REPLAY_BUNDLE] });
      } catch (error) {
        console.warn('[amplitude-configurator] session replay bundle failed to load', error);
      }
    }
    await inject({ files: ['inject.js'] });
  } catch (error) {
    console.error('[amplitude-configurator] injection failed', error);
    await chrome.action.setBadgeText({ tabId, text: 'err' });
  }
});

function describe(payload) {
  const parts = ['analytics'];
  if (payload.sessionReplay) {
    parts.push('session replay');
  }
  let message = `Opened ${payload.url} with ${parts.join(' and ')}.`;
  // Said before the navigation happens, so it can only promise the behaviour; what the policy actually
  // said reaches the page console, which is where the rest of the run is read anyway.
  message += " That tab's Content-Security-Policy is removed, and its console reports what it would have blocked.";
  if (payload.engagement) {
    // Its bundle is fetched from the CDN at runtime rather than packaged here. A strict CSP no longer
    // stands in the way, so this is now only a matter of the runner learning to load it.
    message += ' Guides and Surveys was left out: the runner does not load its CDN bundle yet.';
  }
  if (payload.apiKey === PLACEHOLDER_API_KEY) {
    message += ' No API key is set, so events are built but rejected.';
  }
  return message;
}

async function runOnUrl(payload) {
  const url = new URL(payload.url);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('Only http and https URLs can be instrumented.');
  }
  // The tab opens blank so it can be marked for instrumentation before it commits anything; navigating
  // afterwards is what makes the ordering reliable.
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  await instrument(tab.id, payload);
  await chrome.storage.session.set({ [LAST_PAYLOAD_KEY]: payload });
  await chrome.tabs.update(tab.id, { url: url.toString() });
  return { message: describe(payload) };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== 'run-on-url') {
    return false;
  }
  runOnUrl(message.payload).then(sendResponse, (error) => sendResponse({ error: error.message }));
  return true;
});

// The toolbar button instruments the tab you're looking at, with whatever the configurator sent last.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url?.startsWith('http')) {
    return;
  }
  if ((await instrumentedTabs())[tab.id]) {
    await forget(tab.id);
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  } else {
    const { [LAST_PAYLOAD_KEY]: lastPayload } = await chrome.storage.session.get(LAST_PAYLOAD_KEY);
    await instrument(tab.id, lastPayload ?? FALLBACK_PAYLOAD);
  }
  // The injection only happens on the next commit, which is also the only way to catch a page early.
  await chrome.tabs.reload(tab.id);
});

chrome.tabs.onRemoved.addListener((tabId) => forget(tabId));
